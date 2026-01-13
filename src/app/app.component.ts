import { Component, inject, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { Auth, GoogleAuthProvider, signInWithPopup, signOut, user, User } from '@angular/fire/auth';
import { Subscription } from 'rxjs';
import { SpeedplayService } from './speedplay.service';
import {
  Game,
  Speedrun,
  UserProfile,
  RankingEntry,
  Category,
  Platform,
  SpeedrunSubmission
} from './models';

@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {

  // =============================================
  // CONFIGURACIÓN DE FIREBASE Y SERVICIOS
  // =============================================
  private auth: Auth = inject(Auth);
  userSubscription: Subscription;
  currentUser: User | null = null;
  isAdmin: boolean = false;
  adminEmails: string[] = ['zedrik2013@gmail.com']; // Tu correo de admin

  // =============================================
  // ESTADO DE NAVEGACIÓN Y UI
  // =============================================
  selectedGame: Game | null = null;
  showProfile: boolean = false;
  showRanking: boolean = false;
  showSubmitModal: boolean = false;

  isLoading: boolean = false;
  viewingUsername: string = 'Invitado';

  activeFilter: 'all' | 'popular' | 'recent' | 'favorites' = 'all';
  activeTab: 'speedruns' | 'followers' | 'following' | 'rejected' = 'speedruns';

  selectedCategoryFilter: string = 'Todas';
  selectedPlatformFilter: string = 'Todas';

  notificationCount: number = 0;

  // =============================================
  // DATOS
  // =============================================
  allGamesSource: Game[] = [];
  displayedGames: Game[] = [];

  popularSpeedruns: Game[] = [];
  favoriteSpeedruns: Game[] = [];
  recentSpeedruns: Game[] = [];

  userSpeedruns: Speedrun[] = [];
  userRejectedSpeedruns: Speedrun[] = [];

  globalRankings: RankingEntry[] = [];
  allRankings: RankingEntry[] = [];

  categories: Category[] = [];
  platforms: Platform[] = [];

  gameStats = {
    worldRecord: '0:00:00.000',
    totalSpeedruns: 0,
    averageTime: '0:00:00.000'
  };

  userProfile: UserProfile = {
    Username: 'Invitado',
    Avatar: null,
    Rank: 0,
    Followers: 0,
    Following: 0,
    TotalRuns: 0,
    WorldRecords: 0
  };

  speedrunForm: SpeedrunSubmission = {
    userID: 0,
    gameID: 0,
    categoryID: 1,
    timeHours: 0,
    timeMinutes: 0,
    timeSeconds: 0,
    timeMilliseconds: 0,
    videoURL: '',
    platformID: 1
  };

  constructor(
    private speedplayService: SpeedplayService,
    private cd: ChangeDetectorRef
  ) {
    this.userSubscription = user(this.auth).subscribe((user: User | null) => {
      this.currentUser = user;
      if (user) {
        this.viewingUsername = user.displayName || 'Usuario';
        this.userProfile.Username = user.displayName || 'Usuario';
        this.userProfile.Avatar = user.photoURL;
        this.userProfile.Email = user.email || '';

        if (user.email && this.adminEmails.includes(user.email)) {
          this.isAdmin = true;
        } else {
          this.isAdmin = false;
        }

        this.speedplayService.upsertUser(user.email || '', user.displayName || 'Usuario', user.photoURL, this.isAdmin)
          .subscribe(p => {
            this.userProfile = p;
            this.loadUserSpeedruns();
            this.cd.detectChanges();
          });
      } else {
        this.viewingUsername = 'Invitado';
        this.userProfile = { Username: 'Invitado', Avatar: null, Rank: 0, Followers: 0, Following: 0, TotalRuns: 0, WorldRecords: 0 };
        this.isAdmin = false;
        this.userSpeedruns = [];
        this.userRejectedSpeedruns = [];
        this.notificationCount = 0;
        this.cd.detectChanges();
      }
    });
  }

  ngOnInit() {
    this.activeFilter = 'all';
    this.loadDataInitial();
    this.loadCategories();
    this.loadPlatforms();
  }

  ngOnDestroy() {
    this.userSubscription.unsubscribe();
  }

  // =============================================
  // CARGA DE DATOS
  // =============================================

  loadDataInitial() {
    this.isLoading = true;
    this.speedplayService.getAllGames().subscribe(
      (games) => {
        const normalizedGames = (games || []).map(g => ({
          ...g,
          TotalSpeedruns: Number((g as any).TotalSpeedruns || 0)
        }));

        this.allGamesSource = normalizedGames;

        const gamesWithRuns = normalizedGames.filter(g => g.TotalSpeedruns > 0);
        const sortedByPopularity = gamesWithRuns.sort((a, b) => b.TotalSpeedruns - a.TotalSpeedruns);

        this.popularSpeedruns = sortedByPopularity.slice(0, 5);

        const sortedByRecency = [...normalizedGames].sort((a, b) => (b.GameID || 0) - (a.GameID || 0));
        this.recentSpeedruns = sortedByRecency.slice(0, 5);
        this.favoriteSpeedruns = sortedByPopularity.slice(0, 3);

        this.updateDisplayedGames();
        this.isLoading = false;
        this.cd.detectChanges();
      },
      (err) => {
        console.error('Error cargando juegos', err);
        this.isLoading = false;
        this.cd.detectChanges();
      }
    );
  }

  updateDisplayedGames() {
    switch (this.activeFilter) {
      case 'popular': this.displayedGames = this.popularSpeedruns; break;
      case 'recent': this.displayedGames = this.recentSpeedruns; break;
      case 'favorites': this.displayedGames = this.favoriteSpeedruns; break;
      case 'all': default: this.displayedGames = this.allGamesSource; break;
    }
    this.cd.detectChanges();
  }

  handleFilterChange(filter: any): void {
    this.activeFilter = filter;
    this.updateDisplayedGames();
    this.handleBackToHome();
  }

  loadCategories() {
    this.speedplayService.getAllCategories().subscribe(c => {
      this.categories = c;
      this.cd.detectChanges();
    });
  }

  loadPlatforms() {
    this.speedplayService.getAllPlatforms().subscribe(p => {
      this.platforms = p;
      this.cd.detectChanges();
    });
  }

  // =============================================
  // LOGICA DE RANKING (ADMIN vs USER)
  // =============================================

  loadGameRanking(gameId: number) {
    this.speedplayService.getGameRanking(gameId).subscribe(
      (rankings) => {
        const processed = rankings.map(r => {
          if (r.FormattedTime && r.FormattedTime.indexOf(':') === r.FormattedTime.lastIndexOf(':')) {
            r.FormattedTime = '0:' + r.FormattedTime;
          }
          if (!r.Status) r.Status = 'Pending';
          return r;
        });

        if (!this.isAdmin) {
          this.allRankings = processed.filter(r => r.Status === 'Verified');
        } else {
          this.allRankings = processed;
        }

        this.applyFilters();
        this.isLoading = false;
        this.cd.detectChanges();
      },
      (error) => {
        console.error('Error al cargar ranking:', error);
        this.isLoading = false;
        this.cd.detectChanges();
      }
    );
  }

  applyFilters() {
    let filtered = [...this.allRankings];
    if (this.selectedCategoryFilter && this.selectedCategoryFilter !== 'Todas') {
      filtered = filtered.filter(r => r.CategoryName === this.selectedCategoryFilter);
    }
    if (this.selectedPlatformFilter && this.selectedPlatformFilter !== 'Todas') {
      filtered = filtered.filter(r => r.PlatformName === this.selectedPlatformFilter);
    }

    filtered.sort((a, b) => this.timeToMilliseconds(a.FormattedTime) - this.timeToMilliseconds(b.FormattedTime));

    filtered = filtered.map((entry, index) => {
      if (entry.Status === 'Verified') {
        return { ...entry, Rank: index + 1 };
      }
      return { ...entry, Rank: 0 };
    });

    this.globalRankings = filtered;
    this.calculateStatsFromRankings();
  }

  calculateStatsFromRankings() {
    const verified = this.allRankings.filter(r => r.Status === 'Verified');

    if (!verified || verified.length === 0) {
      this.gameStats = { worldRecord: '0:00:00.000', totalSpeedruns: 0, averageTime: '0:00:00.000' };
      return;
    }

    this.gameStats.totalSpeedruns = verified.length;
    verified.sort((a, b) => this.timeToMilliseconds(a.FormattedTime) - this.timeToMilliseconds(b.FormattedTime));

    this.gameStats.worldRecord = verified[0]?.FormattedTime || '0:00:00.000';

    let totalMs = 0;
    verified.forEach(r => totalMs += this.timeToMilliseconds(r.FormattedTime));
    this.gameStats.averageTime = this.millisecondsToTime(totalMs / verified.length);
    this.cd.detectChanges();
  }

  // =============================================
  // LOGICA DEL USUARIO (PERFIL + NOTIFICACIONES)
  // =============================================

  loadUserSpeedruns() {
    if (this.userProfile.UserID) {
      this.speedplayService.getUserSpeedruns(this.userProfile.UserID).subscribe(s => {
        s.forEach(run => {
          if (!run.Status) run.Status = 'Pending';
        });

        this.userSpeedruns = s.filter(run => run.Status !== 'Rejected');
        this.userRejectedSpeedruns = s.filter(run => run.Status === 'Rejected');
        this.notificationCount = this.userRejectedSpeedruns.length;
        this.cd.detectChanges();
      });
    }
  }

  // =============================================
  // ACCIONES DE ADMIN (CORREGIDAS)
  // =============================================

  verifyRun(entry: any) {
    console.log('Intentando verificar run:', entry); // DEBUG

    const id = entry.SpeedrunID || entry.speedrunID; // Maneja posibles diferencias de mayúsculas/minúsculas
    if (!id) {
      console.error('ERROR: No se encontró SpeedrunID en el objeto:', entry);
      alert('Error: No se pudo obtener el ID del speedrun.');
      return;
    }

    if (!confirm(`¿Verificar este speedrun (ID: ${id})?`)) return;

    // 1. Actualizar UI inmediatamente (Optimista)
    const originalStatus = entry.Status;
    entry.Status = 'Verified';
    this.applyFilters();
    this.cd.detectChanges();

    // 2. Llamar al server
    this.speedplayService.updateSpeedrunStatus(id, 'Verified').subscribe(
      (response) => {
        console.log('Respuesta del servidor:', response);
      },
      (err) => {
        // Revertir si falla
        console.error('Error detallado al verificar:', err);
        entry.Status = originalStatus;
        this.applyFilters();
        // Muestra más info en el alert o consola
        alert(`Error al verificar: ${err.error?.error || err.message || 'Error desconocido'}`);
      }
    );
  }

  rejectRun(entry: any) {
    console.log('Intentando rechazar run:', entry); // DEBUG

    const id = entry.SpeedrunID || entry.speedrunID;
    if (!id) {
      console.error('ERROR: No se encontró SpeedrunID en el objeto:', entry);
      return;
    }

    if (!confirm(`¿Rechazar este speedrun (ID: ${id})?`)) return;

    const originalStatus = entry.Status;
    entry.Status = 'Rejected';
    this.applyFilters();
    this.cd.detectChanges();

    this.speedplayService.updateSpeedrunStatus(id, 'Rejected').subscribe(
      (response) => {
        console.log('Respuesta rechazo:', response);
      },
      (err) => {
        console.error('Error detallado al rechazar:', err);
        entry.Status = originalStatus;
        this.applyFilters();
        alert(`Error al rechazar: ${err.error?.error || err.message}`);
      }
    );
  }

  deleteRun(entry: any) {
    const id = entry.SpeedrunID || entry.speedrunID;
    if (!id) return;
    if (!confirm(`¿ELIMINAR PERMANENTEMENTE este run?`)) return;

    this.allRankings = this.allRankings.filter(r => r.SpeedrunID !== id);
    this.applyFilters();
    this.cd.detectChanges();

    this.speedplayService.deleteSpeedrun(id).subscribe(
      () => { },
      (err) => {
        console.error('Error al eliminar:', err);
        alert('Error al eliminar. Recarga la página.');
        this.loadGameRanking(this.selectedGame?.GameID || 0);
      }
    );
  }

  // =============================================
  // UTILIDADES
  // =============================================

  formatDate(dateStr: string | Date): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  timeToMilliseconds(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    let h = 0, m = 0, s = 0, ms = 0;
    if (parts.length === 3) {
      h = parseInt(parts[0]) || 0; m = parseInt(parts[1]) || 0;
      const sec = parts[2].split('.'); s = parseInt(sec[0]) || 0; ms = parseInt(sec[1]) || 0;
    } else if (parts.length === 2) {
      m = parseInt(parts[0]) || 0;
      const sec = parts[1].split('.'); s = parseInt(sec[0]) || 0; ms = parseInt(sec[1]) || 0;
    }
    return (h * 3600000) + (m * 60000) + (s * 1000) + ms;
  }

  millisecondsToTime(ms: number): string {
    const h = Math.floor(ms / 3600000); ms %= 3600000;
    const m = Math.floor(ms / 60000); ms %= 60000;
    const s = Math.floor(ms / 1000);
    const mil = Math.floor(ms % 1000);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
  }

  // =============================================
  // NAVEGACIÓN Y UI
  // =============================================

  handleGameClick(game: Game): void {
    this.isLoading = true;
    this.selectedGame = game;
    this.showProfile = false;
    this.showRanking = true;
    this.allRankings = [];
    this.globalRankings = [];
    this.gameStats = { worldRecord: '...', totalSpeedruns: 0, averageTime: '...' };
    this.selectedCategoryFilter = 'Todas';
    this.selectedPlatformFilter = 'Todas';
    this.cd.detectChanges();
    if (game.GameID) {
      this.loadGameRanking(game.GameID);
    }
  }

  handleBackToHome(): void {
    this.selectedGame = null;
    this.showProfile = false;
    this.showRanking = false;
    this.showSubmitModal = false;
    this.selectedCategoryFilter = 'Todas';
    this.selectedPlatformFilter = 'Todas';
    this.viewingUsername = this.currentUser?.displayName || 'Invitado';
    this.cd.detectChanges();
  }

  handleProfileClick(): void {
    if (this.currentUser) {
      this.showProfile = true;
      this.selectedGame = null;
      this.showRanking = false;
      this.loadUserSpeedruns();
      this.cd.detectChanges();
    } else {
      this.loginWithGoogle();
    }
  }

  handleTabChange(tab: any): void {
    this.activeTab = tab;
    this.cd.detectChanges();
  }

  openSubmitModal(): void {
    if (!this.currentUser) {
      this.loginWithGoogle();
      return;
    }
    if (this.selectedGame) {
      this.showSubmitModal = true;
      this.speedrunForm = {
        userID: this.userProfile.UserID || 0,
        gameID: this.selectedGame.GameID || 0,
        categoryID: 1,
        timeHours: 0,
        timeMinutes: 0,
        timeSeconds: 0,
        timeMilliseconds: 0,
        videoURL: '',
        platformID: 1
      };
      this.cd.detectChanges();
    }
  }

  closeSubmitModal(): void {
    this.showSubmitModal = false;
    this.cd.detectChanges();
  }

  submitSpeedrun(): void {
    if (!this.speedrunForm.videoURL) {
      alert('Falta URL del video');
      return;
    }
    this.speedplayService.submitSpeedrun(this.speedrunForm).subscribe(
      () => {
        alert('Enviado correctamente. Tu run estará "En Revisión".');
        this.closeSubmitModal();
        if (this.selectedGame?.GameID) this.loadGameRanking(this.selectedGame.GameID);
      },
      (err) => console.error(err)
    );
  }

  loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    signInWithPopup(this.auth, provider).then(() => this.handleProfileClick());
  }

  logout() {
    signOut(this.auth).then(() => this.handleBackToHome());
  }

  playVideo(url: string) {
    if (url) {
      window.open(url, '_blank');
    } else {
      console.warn('URL de video vacía o no válida');
      alert('No hay URL de video disponible');
    }
  }

  getFilteredRankings() { return this.globalRankings; }

  getUniquePlatforms() {
    return Array.from(new Set(this.allRankings.map(r => r.PlatformName).filter(p => !!p))).sort();
  }

  getWelcomeTitle() {
    const t: any = { 'all': `¡Bienvenido, ${this.viewingUsername}!`, 'popular': 'Top 5 Populares', 'recent': 'Recientes', 'favorites': 'Favoritos' };
    return t[this.activeFilter];
  }
  getWelcomeDescription() {
    const d: any = {
      'all': 'Explora nuestra colección completa de speedruns.',
      'popular': 'Los 5 juegos con más runs en la comunidad.',
      'recent': 'Los últimos juegos añadidos.',
      'favorites': 'Tus juegos marcados como favoritos.'
    };
    return d[this.activeFilter];
  }
  clearFilters() {
    this.selectedCategoryFilter = 'Todas';
    this.selectedPlatformFilter = 'Todas';
    this.applyFilters();
  }
}
