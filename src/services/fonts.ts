import { invoke } from "@tauri-apps/api/core";

export function listSystemFonts(): Promise<string[]> {
  return invoke<string[]>("system_fonts_list");
}
