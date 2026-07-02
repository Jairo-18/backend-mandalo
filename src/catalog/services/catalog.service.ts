import { Injectable } from '@nestjs/common';
import { DepartmentRepository } from '../../shared/repositories/department.repository';
import { MunicipalityRepository } from '../../shared/repositories/municipality.repository';
import { IdentificationTypeRepository } from '../../shared/repositories/identificationType.repository';

@Injectable()
export class CatalogService {
  constructor(
    private readonly _departmentRepository: DepartmentRepository,
    private readonly _municipalityRepository: MunicipalityRepository,
    private readonly _identificationTypeRepository: IdentificationTypeRepository,
  ) {}

  getDepartments() {
    return this._departmentRepository.find({ order: { name: 'ASC' } });
  }

  getMunicipalities(departmentId?: number) {
    return this._municipalityRepository.find({
      where: departmentId ? { departmentId } : {},
      order: { name: 'ASC' },
    });
  }

  getIdentificationTypes() {
    return this._identificationTypeRepository.find({ order: { name: 'ASC' } });
  }
}
