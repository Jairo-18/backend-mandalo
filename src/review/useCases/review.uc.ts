import { Injectable } from '@nestjs/common';
import { ReviewService } from '../services/review.service';
import { CreateReviewDto } from '../dtos/review.dto';
import { User } from '../../shared/entities/user.entity';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

@Injectable()
export class ReviewUC {
  constructor(private readonly _reviewService: ReviewService) {}

  async statusForInvoice(user: User, invoiceId: number) {
    return await this._reviewService.statusForInvoice(user, invoiceId);
  }

  async create(user: User, invoiceId: number, dto: CreateReviewDto) {
    return await this._reviewService.create(user, invoiceId, dto);
  }

  async mine(user: User, params: ParamsPaginationDto) {
    return await this._reviewService.mine(user, params);
  }

  async forBusiness(organizationalId: number, params: ParamsPaginationDto) {
    return await this._reviewService.forBusiness(organizationalId, params);
  }

  async forUser(userId: string, params: ParamsPaginationDto) {
    return await this._reviewService.forUser(userId, params);
  }

  async remove(user: User, id: number) {
    return await this._reviewService.remove(user, id);
  }
}
