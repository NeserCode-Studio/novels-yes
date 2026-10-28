use std::collections::BTreeMap;

#[tauri::command]
pub async fn system_fonts_list() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(collect_system_fonts)
        .await
        .map_err(|error| format!("Failed to collect system fonts: {error}"))
}

fn collect_system_fonts() -> Vec<String> {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();

    let mut families = BTreeMap::<String, String>::new();
    for face in database.faces() {
        for (family, _) in &face.families {
            let display_name = family.trim();
            if display_name.is_empty() {
                continue;
            }

            families
                .entry(display_name.to_lowercase())
                .or_insert_with(|| display_name.to_owned());
        }
    }

    let mut result = families.into_values().collect::<Vec<_>>();
    result.sort_by_key(|family| family.to_lowercase());
    result
}

#[cfg(test)]
mod tests {
    use super::collect_system_fonts;

    #[test]
    fn system_fonts_are_sorted_and_unique() {
        let fonts = collect_system_fonts();
        assert!(
            !fonts.is_empty(),
            "system font database should not be empty"
        );

        let mut normalized = fonts
            .iter()
            .map(|font| font.to_lowercase())
            .collect::<Vec<_>>();
        normalized.sort();
        normalized.dedup();

        assert_eq!(normalized.len(), fonts.len());
        assert!(fonts
            .windows(2)
            .all(|pair| pair[0].to_lowercase() <= pair[1].to_lowercase()));
    }
}
