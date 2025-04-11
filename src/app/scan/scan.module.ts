import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ScanPageRoutingModule } from './scan-routing.module';
import { ScanPage } from './scan.page';

@NgModule({
  imports: [
    ScanPageRoutingModule,
    SharedModule
  ],
  declarations: [ScanPage]
})
export class ScanPageModule {}
