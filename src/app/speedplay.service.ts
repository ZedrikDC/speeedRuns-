import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Game,
  RankingEntry,
  Category,
  Platform,
  SpeedrunSubmission,
  UserProfile
} from './models';

@Injectable({
  providedIn: 'root'
})
export class SpeedplayService {

  // IMPORTANTE: Asegúrate de que esta URL coincida con tu backend
  private apiUrl = 'http://localhost:5000/api';

  constructor(private http: HttpClient) { }

  // =============================================
  // MÉTODOS DE JUEGOS
  // =============================================

  getAllGames(): Observable<Game[]> {
    return this.http.get<Game[]>(`${this.apiUrl}/games`);
  }

  getGameById(gameId: number): Observable<Game> {
    return this.http.get<Game>(`${this.apiUrl}/games/${gameId}`);
  }

  getPopularGames(): Observable<Game[]> {
    return this.http.get<Game[]>(`${this.apiUrl}/games/popular`);
  }

  getRecentGames(): Observable<Game[]> {
    return this.http.get<Game[]>(`${this.apiUrl}/games/recent`);
  }

  // Obtener estadísticas del juego (récord, promedio, total)
  getGameStats(gameId: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/games/${gameId}/stats`);
  }

  // =============================================
  // MÉTODOS DE RANKING
  // =============================================

  getGameRanking(
    gameId: number,
    categoryId?: number,
    platformFilter?: string
  ): Observable<RankingEntry[]> {
    let params = new HttpParams();
    if (categoryId) params = params.set('categoryId', categoryId.toString());
    if (platformFilter) params = params.set('platform', platformFilter);

    return this.http.get<RankingEntry[]>(
      `${this.apiUrl}/rankings/${gameId}`,
      { params }
    );
  }

  // =============================================
  // MÉTODOS DE SPEEDRUNS (CRUD Y ADMIN)
  // =============================================

  submitSpeedrun(speedrun: SpeedrunSubmission): Observable<any> {
    return this.http.post(`${this.apiUrl}/speedruns`, speedrun);
  }

  getUserSpeedruns(userId: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/speedruns/user/${userId}`);
  }

  deleteSpeedrun(speedrunId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/speedruns/${speedrunId}`);
  }

  // NUEVO: Método para cambiar estado (Verificar/Rechazar)
  updateSpeedrunStatus(speedrunId: number, status: 'Verified' | 'Rejected' | 'Pending'): Observable<any> {
    return this.http.put(`${this.apiUrl}/speedruns/${speedrunId}/status`, { status });
  }

  // =============================================
  // MÉTODOS DE CATEGORÍAS
  // =============================================

  getAllCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.apiUrl}/categories`);
  }

  // =============================================
  // MÉTODOS DE PLATAFORMAS
  // =============================================

  getAllPlatforms(): Observable<Platform[]> {
    return this.http.get<Platform[]>(`${this.apiUrl}/platforms`);
  }

  // =============================================
  // MÉTODOS DE USUARIOS
  // =============================================

  upsertUser(email: string, username: string, avatar: string | null, isAdmin: boolean): Observable<UserProfile> {
    return this.http.post<UserProfile>(`${this.apiUrl}/users/upsert`, {
      email,
      username,
      avatar,
      isAdmin
    });
  }

  getUserProfile(userId: number): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${this.apiUrl}/users/${userId}`);
  }

  updateUserProfile(userId: number, profile: Partial<UserProfile>): Observable<any> {
    return this.http.put(`${this.apiUrl}/users/${userId}`, profile);
  }
}
