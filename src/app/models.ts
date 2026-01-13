// =============================================
// MODELOS/INTERFACES DE LA APLICACIÓN
// =============================================

export interface Game {
  GameID?: number;
  Title: string;
  ImageURL?: string;
  Year: string;
  TotalSpeedruns: number;
  Platforms?: string;
  WorldRecord?: string;
  AverageTime?: string;
  Description?: string;
}

export interface Speedrun {
  SpeedrunID?: number;
  UserID?: number;
  GameID?: number;
  game: string;
  time: string;
  category: string;
  CategoryID?: number;
  date: string;

  // FIX: Permitimos ambas formas para evitar errores de compilación
  videoURL?: string;
  VideoURL?: string;

  platform?: string;
  isVerified?: boolean;
  Status?: 'Pending' | 'Verified' | 'Rejected';
}

export interface UserProfile {
  UserID?: number;
  Email?: string;
  Username: string;
  Avatar: string | null;
  Rank: number;
  Followers: number;
  Following: number;
  TotalRuns: number;
  WorldRecords: number;
  IsAdmin?: boolean;
}

export interface RankingEntry {
  SpeedrunID: number;
  Rank: number;
  UserID: number;
  Username: string;
  Avatar?: string;
  FormattedTime: string;
  PlatformName: string;
  CreatedAt: string;
  Status: 'Pending' | 'Verified' | 'Rejected';

  // FIX: Permitimos ambas formas aquí también
  VideoURL?: string;
  videoURL?: string;

  CategoryName: string;
  CategoryID: number;
  Verified?: boolean;
}

export interface Category {
  CategoryID: number;
  CategoryName: string;
  Description: string;
  IconColor: string;
}

export interface Platform {
  PlatformID: number;
  PlatformName: string;
}

export interface SpeedrunSubmission {
  userID: number;
  gameID: number;
  categoryID: number;
  timeHours: number;
  timeMinutes: number;
  timeSeconds: number;
  timeMilliseconds: number;
  videoURL: string;
  platformID: number;
}
