import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ScanPageRoutingModule } from './scan-routing.module';
import { ScanPage } from './scan.page';
import { File } from '@awesome-cordova-plugins/file/ngx';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { FileTransfer } from '@awesome-cordova-plugins/file-transfer/ngx';

@NgModule({
  imports: [
    ScanPageRoutingModule,
    SharedModule
  ],
  declarations: [ScanPage],
  providers: [
    File,
    FileOpener,
    FileChooser,
    FileTransfer
  ]
})
export class ScanPageModule {}
