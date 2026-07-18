use std::io::Cursor;

use uesave::{SaveReader, games::palworld::palworld_types};
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Parses a decompressed Palworld 1.0 PLZ/GVAS save into uesave's lossless JSON model.
#[wasm_bindgen]
pub fn sav_to_json(data: &[u8]) -> Result<String, JsValue> {
    let save = SaveReader::new()
        .types(palworld_types())
        .error_to_raw(true)
        .read(Cursor::new(data))
        .map_err(|error| JsValue::from_str(&error.to_string()))?;

    serde_json::to_string(&save).map_err(|error| JsValue::from_str(&error.to_string()))
}
