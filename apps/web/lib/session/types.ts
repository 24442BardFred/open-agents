export interface Session {
  created: number;
  authProvider: "vercel" | "github";
  activeTeamId?: string;
  user: {
    id: string;
    username: string;
    email: string | undefined;
    avatar: string;
    name?: string;
  };
}

export interface SessionUserInfo {
  user: Session["user"] | undefined;
  authProvider?: "vercel" | "github";
  activeTeamId?: string;
  teams?: Array<{
    id: string;
    name: string;
    role: "owner" | "member";
    isPersonal: boolean;
  }>;
  hasGitHub?: boolean;
  hasGitHubAccount?: boolean;
  hasGitHubInstallations?: boolean;
}
