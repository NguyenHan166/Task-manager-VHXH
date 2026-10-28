import { apiClient, isMockMode } from "./api-client";
import { HttpRepository } from "./http-repository";
import { mockRepository, type MockRepository } from "../mocks/mock-repository";

export type WorkspaceRepository =
  Pick<MockRepository, keyof MockRepository> &
  Pick<HttpRepository, keyof HttpRepository>;

export const httpRepository = new HttpRepository();
export const workspaceRepository = (
  isMockMode ? mockRepository : httpRepository
) as unknown as WorkspaceRepository;

export { apiClient, isMockMode };
