import { api } from "./provider";

export interface NoteVersion {
  id: string;
  title: string;
  text_content: string;
  updated_at: string;
}

export const noteVersionApi = {
  getVersions: (noteId: string) =>
    api.get<NoteVersion[]>(`/notes/${noteId}/versions`),

  restoreVersion: (noteId: string, versionId: string) =>
    api.post<{ content: string; title: string }>(
      `/notes/${noteId}/versions/${versionId}/restore`
    ),
};
