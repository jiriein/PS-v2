import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ScanPageRoutingModule } from './scan-routing.module';
import { ScanPage } from './scan.page';
import { FileChooser } from '@awesome-cordova-plugins/file-chooser/ngx';
import { File } from '@awesome-cordova-plugins/file/ngx';
import { FileTransfer } from '@awesome-cordova-plugins/file-transfer/ngx';
import { FileOpener } from '@awesome-cordova-plugins/file-opener/ngx';

@NgModule({
  imports: [
    ScanPageRoutingModule,
    SharedModule
  ],
  declarations: [ScanPage],
  providers: [
    FileChooser,
    File,
    FileTransfer,
    FileOpener
  ]
})
export class ScanPageModule {}
