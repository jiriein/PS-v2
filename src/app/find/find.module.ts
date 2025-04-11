import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { FindPage } from './find.page';
import { FindPageRoutingModule } from './find-routing.module';


@NgModule({
  imports: [
    FindPageRoutingModule,
    SharedModule
  ],
  declarations: [FindPage]
})
export class FindPageModule {}
