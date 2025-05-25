import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { DocumentDetailPage } from './document-detail.page';

const routes: Routes = [
  {
    path: '',
    component: DocumentDetailPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DocumentDetailPageRoutingModule {}