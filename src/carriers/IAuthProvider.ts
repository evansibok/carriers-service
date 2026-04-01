export interface IAuthProvider {
  getToken(): Promise<string>;
  invalidate(): void;
}
