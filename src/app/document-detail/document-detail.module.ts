import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { DocumentDetailPageRoutingModule } from './document-detail-routing.module';
import { DocumentDetailPage } from './document-detail.page';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DocumentDetailPageRoutingModule,
    SharedModule
  ],
  declarations: [DocumentDetailPage]
})
export class DocumentDetailPageModule {}