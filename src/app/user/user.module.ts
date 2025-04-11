import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { UserPageRoutingModule } from './user-routing.module';
import { UserPage } from './user.page';

@NgModule({
  imports: [
    UserPageRoutingModule,
    SharedModule
  ],
  declarations: [UserPage]
})
export class UserPageModule {}
