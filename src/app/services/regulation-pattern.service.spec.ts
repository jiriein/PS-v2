import { TestBed } from '@angular/core/testing';

import { RegulationPatternService } from './regulation-pattern.service';

describe('RegulationPatternService', () => {
  let service: RegulationPatternService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RegulationPatternService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
