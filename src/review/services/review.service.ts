import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ReviewRepository } from '../../shared/repositories/review.repository';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { UserRepository } from '../../shared/repositories/user.repository';
import { Review, ReviewTargetType } from '../../shared/entities/review.entity';
import { Invoice } from '../../shared/entities/invoice.entity';
import { User } from '../../shared/entities/user.entity';
import { Organizational } from '../../shared/entities/organizational.entity';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import {
  ParamsPaginationDto,
  ResponsePaginationDto,
} from '../../shared/dtos/pagination.dto';
import {
  RoleTypeCode,
  isAdminRole,
} from '../../shared/roles/roleTypeCode.enum';
import {
  isOutsideMunicipalityScope,
  scopeMunicipalityIdFor,
} from '../../shared/utils/municipality-scope.util';
import { containsProfanity } from '../../shared/utils/profanity.util';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';
import { PushService } from '../../shared/services/push.service';
import { InvoiceGateway } from '../../invoice/invoice.gateway';
import { CreateReviewDto } from '../dtos/review.dto';

/** Días después de la entrega en los que se puede reseñar. */
export const REVIEW_WINDOW_DAYS = 7;

/** Cada parte del pedido, con el rol que se guarda como `authorRole`. */
const PARTY_ROLE: Record<ReviewTargetType, RoleTypeCode> = {
  [ReviewTargetType.CLIENT]: RoleTypeCode.CLIENT,
  [ReviewTargetType.BUSINESS]: RoleTypeCode.BUSINESS,
  [ReviewTargetType.DELIVERY]: RoleTypeCode.DELIVERY,
};

/** Reseña tal como la ve cualquiera (sin ids de usuario ni del pedido). */
export type PublicReview = {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: Date;
  authorRole: string;
  authorName: string | null;
  /** Logo del negocio (autor NEGO) o foto de la persona; null = sin foto. */
  authorImageUrl: string | null;
};

export type RatingSummary = { average: number | null; count: number };

/**
 * Reseñas entre cliente, negocio y repartidor de un pedido ENTREGADO: cada
 * parte califica a las otras dos, una vez, hasta `REVIEW_WINDOW_DAYS` días
 * después de la entrega, sin edición. El promedio del calificado lo
 * recalcula un trigger de la DB (migración AddReviews).
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly _reviewRepository: ReviewRepository,
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _userRepository: UserRepository,
    private readonly _pushService: PushService,
    private readonly _gateway: InvoiceGateway,
  ) {}

  // ---------- reseñar un pedido ----------

  /**
   * Qué puede reseñar el usuario en este pedido: las otras partes (el
   * repartidor solo si hubo uno), con la reseña que ya les dejó, si la hay.
   */
  async statusForInvoice(user: User, invoiceId: number) {
    const { invoice, party } = await this.loadParticipation(user, invoiceId);
    const deadline = this.deadlineFor(invoice);
    const open = this.isOpen(invoice, deadline);

    const mine = await this._reviewRepository.find({
      where: { invoiceId, authorRole: PARTY_ROLE[party] },
    });

    const targets = this.targetsFor(invoice, party).map((targetType) => {
      const review = mine.find((r) => r.targetType === targetType);
      return {
        targetType,
        ...this.targetInfo(invoice, targetType),
        review: review ? this.toPublic(review) : null,
      };
    });

    return {
      invoiceId,
      myRole: party,
      open,
      deadline,
      canReview: open && targets.some((t) => !t.review),
      targets,
    };
  }

  async create(
    user: User,
    invoiceId: number,
    dto: CreateReviewDto,
  ): Promise<PublicReview> {
    const { invoice, party, organizational } = await this.loadParticipation(
      user,
      invoiceId,
    );

    if (!this.isOpen(invoice, this.deadlineFor(invoice))) {
      throw new ForbiddenException(
        `Solo puedes calificar pedidos entregados, hasta ${REVIEW_WINDOW_DAYS} días después de la entrega.`,
      );
    }
    if (!this.targetsFor(invoice, party).includes(dto.targetType)) {
      throw new ForbiddenException('No puedes calificar a esa parte del pedido.');
    }
    if (containsProfanity(dto.comment)) {
      throw new BadRequestException(
        'Tu comentario tiene palabras no permitidas. Por favor, edítalo.',
      );
    }

    const isBusinessTarget = dto.targetType === ReviewTargetType.BUSINESS;
    const targetUserId =
      dto.targetType === ReviewTargetType.CLIENT
        ? invoice.userId
        : dto.targetType === ReviewTargetType.DELIVERY
          ? invoice.deliveryUserId
          : null;

    let saved: Review;
    try {
      saved = await this._reviewRepository.save(
        this._reviewRepository.create({
          invoiceId,
          authorUserId: user.id,
          authorRole: PARTY_ROLE[party],
          authorOrganizationalId: organizational?.id ?? null,
          authorName: organizational
            ? organizational.tradeName || organizational.legalName
            : user.fullName,
          targetType: dto.targetType,
          targetUserId: isBusinessTarget ? null : targetUserId,
          targetOrganizationalId: isBusinessTarget
            ? invoice.organizationalId
            : null,
          rating: dto.rating,
          comment: dto.comment ?? null,
        }),
      );
    } catch (e) {
      // UQ_review_invoice_author_target: doble toque o dos dispositivos.
      if (
        e instanceof QueryFailedError &&
        (e as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Ya calificaste a esta parte del pedido.');
      }
      throw e;
    }

    this.notifyReviewed(saved, invoice, invoiceId);
    return this.toPublic(saved);
  }

  /**
   * Avisa a la parte CALIFICADA: push (app cerrada/minimizada; el handler de
   * primer plano también lo muestra) + evento `review:received` por el
   * socket, que refresca "Mis reseñas" en vivo y es el único aviso en los
   * teléfonos sin push (Huawei sin GMS) — ver `in-app-alerts.ts`.
   */
  private notifyReviewed(review: Review, invoice: Invoice, invoiceId: number) {
    const stars = review.rating.toLocaleString('es-CO');
    const author = review.authorName || 'Alguien';
    const isBusinessTarget = review.targetType === ReviewTargetType.BUSINESS;
    const title = isBusinessTarget
      ? `⭐ ${author} calificó tu negocio con ${stars}`
      : `⭐ ${author} te calificó con ${stars}`;
    const body = review.comment
      ? review.comment.length > 120
        ? `“${review.comment.slice(0, 117)}…”`
        : `“${review.comment}”`
      : `Pedido #${invoiceId}`;
    const data = { type: 'review', invoiceId };
    const event = {
      invoiceId,
      rating: review.rating,
      targetType: review.targetType,
      title,
      body,
    };

    if (isBusinessTarget) {
      void this._pushService.sendToUsers(
        [invoice.organizational?.legalPersonId],
        { title, body, data },
      );
      this._gateway.emitToOrg(invoice.organizationalId, 'review:received', event);
    } else if (review.targetUserId) {
      void this._pushService.sendToUsers([review.targetUserId], {
        title,
        body,
        data,
      });
      this._gateway.emitToUser(review.targetUserId, 'review:received', event);
    }
  }

  // ---------- leer reseñas ----------

  /** Las reseñas que YO recibí (negocio: las de mi negocio). */
  async mine(user: User, params: ParamsPaginationDto) {
    if (user.roleType?.code === RoleTypeCode.BUSINESS) {
      const org = await this._organizationalRepository.findOne({
        where: { legalPersonId: user.id },
      });
      if (!org) {
        throw new NotFoundException(
          'Tu cuenta no tiene un negocio asociado. Contacta al administrador.',
        );
      }
      return this.forBusiness(org.id, params);
    }
    return this.forUser(user.id, params);
  }

  async forBusiness(organizationalId: number, params: ParamsPaginationDto) {
    const org = await this._organizationalRepository.findOne({
      where: { id: organizationalId },
    });
    if (!org) throw new NotFoundException('Negocio no encontrado');
    return {
      summary: this.summaryOf(org),
      reviews: await this.list({ targetOrganizationalId: org.id }, params),
    };
  }

  async forUser(userId: string, params: ParamsPaginationDto) {
    const target = await this._userRepository.findOne({ where: { id: userId } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    return {
      summary: this.summaryOf(target),
      reviews: await this.list({ targetUserId: target.id }, params),
    };
  }

  // ---------- admin ----------

  /**
   * Borra una reseña (moderación). El admin regional solo las de pedidos de
   * negocios de su municipio. El trigger recalcula el promedio del calificado.
   */
  async remove(user: User, id: number): Promise<void> {
    if (!isAdminRole(user.roleType?.code)) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }
    const review = await this._reviewRepository.findOne({
      where: { id },
      relations: ['invoice', 'invoice.organizational'],
    });
    if (!review) throw new NotFoundException('Reseña no encontrada');
    if (
      isOutsideMunicipalityScope(
        review.invoice?.organizational?.municipalityId,
        scopeMunicipalityIdFor(user),
      )
    ) {
      throw new ForbiddenException('Esta reseña no es de tu municipio.');
    }
    await this._reviewRepository.delete(review.id);
  }

  // ---------- helpers ----------

  private async list(
    where: { targetUserId: string } | { targetOrganizationalId: number },
    params: ParamsPaginationDto,
  ): Promise<ResponsePaginationDto<PublicReview>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 20;
    const [rows, itemCount] = await this._reviewRepository.findAndCount({
      where,
      // Para la foto del autor (solo se usa avatarUrl / logoUrl en toPublic).
      relations: ['author', 'authorOrganizational'],
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });
    const pagination = new PageMetaDto({
      itemCount,
      pageOptionsDto: { ...params, page, perPage },
    });
    return new ResponsePaginationDto(rows.map((r) => this.toPublic(r)), pagination);
  }

  private summaryOf(target: User | Organizational): RatingSummary {
    return {
      average: target.ratingAverage ?? null,
      count: target.ratingCount ?? 0,
    };
  }

  private toPublic(review: Review): PublicReview {
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment ?? null,
      createdAt: review.createdAt,
      authorRole: review.authorRole,
      authorName: review.authorName ?? null,
      authorImageUrl:
        (review.authorRole === RoleTypeCode.BUSINESS
          ? review.authorOrganizational?.logoUrl
          : review.author?.avatarUrl) ?? null,
    };
  }

  /**
   * Qué parte del pedido es el usuario. El admin no participa: no reseña.
   * Al negocio se le devuelve también su `organizational` (firma la reseña).
   */
  private async loadParticipation(user: User, invoiceId: number) {
    const invoice = await this._invoiceRepository.findOne({
      where: { id: invoiceId },
      relations: ['stateType', 'organizational', 'user', 'deliveryUser'],
    });
    if (!invoice) throw new NotFoundException('Pedido no encontrado');

    const roleCode = user.roleType?.code;
    if (roleCode === RoleTypeCode.CLIENT && invoice.userId === user.id) {
      return { invoice, party: ReviewTargetType.CLIENT, organizational: null };
    }
    if (
      roleCode === RoleTypeCode.DELIVERY &&
      invoice.deliveryUserId === user.id
    ) {
      return { invoice, party: ReviewTargetType.DELIVERY, organizational: null };
    }
    if (
      roleCode === RoleTypeCode.BUSINESS &&
      invoice.organizational?.legalPersonId === user.id
    ) {
      return {
        invoice,
        party: ReviewTargetType.BUSINESS,
        organizational: invoice.organizational,
      };
    }
    throw new ForbiddenException('No participaste en este pedido.');
  }

  /**
   * Las otras partes; el repartidor solo si el pedido tuvo uno y el negocio
   * solo si hubo (un mandado es solo cliente ↔ repartidor).
   */
  private targetsFor(
    invoice: Invoice,
    party: ReviewTargetType,
  ): ReviewTargetType[] {
    return Object.values(ReviewTargetType).filter(
      (t) =>
        t !== party &&
        (t !== ReviewTargetType.DELIVERY || !!invoice.deliveryUserId) &&
        (t !== ReviewTargetType.BUSINESS || invoice.organizationalId != null),
    );
  }

  private targetInfo(invoice: Invoice, targetType: ReviewTargetType) {
    if (targetType === ReviewTargetType.BUSINESS) {
      const org = invoice.organizational;
      return {
        name: org?.tradeName || org?.legalName || 'Negocio',
        imageUrl: org?.logoUrl ?? null,
      };
    }
    const target =
      targetType === ReviewTargetType.CLIENT
        ? invoice.user
        : invoice.deliveryUser;
    return {
      name: target?.fullName || (targetType === ReviewTargetType.CLIENT ? 'Cliente' : 'Repartidor'),
      imageUrl: target?.avatarUrl ?? null,
    };
  }

  private deadlineFor(invoice: Invoice): Date | null {
    if (!invoice.deliveredAt) return null;
    return new Date(
      new Date(invoice.deliveredAt).getTime() +
        REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
  }

  private isOpen(invoice: Invoice, deadline: Date | null): boolean {
    return (
      invoice.stateType?.code === StateTypeCode.DELIVERED &&
      !!deadline &&
      deadline.getTime() > Date.now()
    );
  }
}
