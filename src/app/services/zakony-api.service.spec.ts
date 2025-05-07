import { TestBed } from '@angular/core/testing';

import { ZakonyApiService } from './zakony-api.service';

describe('ZakonyApiService', () => {
  let service: ZakonyApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ZakonyApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
