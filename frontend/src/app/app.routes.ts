import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Host } from './host/host';
import { Play } from './play/play';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'host', component: Host },
  { path: 'play', component: Play },
  { path: '**', redirectTo: '' },
];
