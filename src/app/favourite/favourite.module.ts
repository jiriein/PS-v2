import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { FavouritePageRoutingModule } from './favourite-routing.module';
import { FavouritePage } from './favourite.page';


@NgModule({
  imports: [
    FavouritePageRoutingModule,
    SharedModule
  ],
  declarations: [FavouritePage]
})
export class FavouritePageModule {}
