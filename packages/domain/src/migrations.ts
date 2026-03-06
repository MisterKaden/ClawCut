import { type ProjectDocumentV1, parseProjectDocument } from "./project";

export function migrateProjectDocument(input: unknown): ProjectDocumentV1 {
  return parseProjectDocument(input);
}
