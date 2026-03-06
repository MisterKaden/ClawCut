import { type ProjectDocumentV3, parseProjectDocument } from "./project";

export function migrateProjectDocument(input: unknown): ProjectDocumentV3 {
  return parseProjectDocument(input);
}
