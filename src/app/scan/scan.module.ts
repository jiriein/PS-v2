import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ScanPageRoutingModule } from './scan-routing.module';
import { ScanPage } from './scan.page';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  imports: [
    ScanPageRoutingModule,
    SharedModule,
    TranslateModule.forChild()
  ],
  declarations: [ScanPage],
  providers: [
    FileOpener,
    FileChooser
  ]
})
export class ScanPageModule {}