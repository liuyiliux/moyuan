import { api } from "./provider";

export interface Annotation {
  id: string;
  content_id: string;
  selected_text: string;
  start_offset: number;
  end_offset: number;
  annotation_text: string;
  created_at: string;
}

export interface AnnotationCreate {
  content_id: string;
  selected_text: string;
  start_offset: number;
  end_offset: number;
  annotation_text: string;
}

export const annotationApi = {
  list: (contentId: string) => api.get<Annotation[]>(`/annotations?content_id=${contentId}`),
  create: (data: AnnotationCreate) => api.post<Annotation>("/annotations", data),
  delete: (id: string) => api.delete<void>(`/annotations/${id}`),
};
