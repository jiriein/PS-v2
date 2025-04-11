import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { TabsPage } from './tabs.page';

const routes: Routes = [
  {
    path: '',
    component: TabsPage,
    children: [
      {
        path: 'favourite',
        loadChildren: () => import('../favourite/favourite.module').then(m => m.FavouritePageModule)
      },
      {
        path: 'find',
        loadChildren: () => import('../find/find.module').then(m => m.FindPageModule)
      },
      {
        path: 'scan',
        loadChildren: () => import('../scan/scan.module').then(m => m.ScanPageModule)
      },
      {
        path: 'settings',
        loadChildren: () => import('../settings/settings.module').then(m => m.SettingsPageModule)
      },
      {
        path: 'user',
        loadChildren: () => import('../user/user.module').then(m => m.UserPageModule)
      },
      {
        path: '',
        redirectTo: 'scan',
        pathMatch: 'full'
      }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TabsPageRoutingModule {}