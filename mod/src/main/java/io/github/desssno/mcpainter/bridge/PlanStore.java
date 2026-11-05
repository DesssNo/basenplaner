package io.github.desssno.mcpainter.bridge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;
import io.github.desssno.mcpainter.MCPainter;
import io.github.desssno.mcpainter.bridge.BridgeServer.ApiException;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Pläne pro Welt (Konzept Abschnitt 8): Der Editor im Spiel speichert automatisch nach
 * {@code <welt>/data/mcpainter/plan.json} statt im Browser-Speicher.
 */
final class PlanStore {
    private PlanStore() {
    }

    private static Path file(Path world) {
        return world.resolve("data").resolve(MCPainter.MODID).resolve("plan.json");
    }

    /** Gespeicherter Plan oder ein leeres Objekt, wenn es für diese Welt noch keinen gibt. */
    static JsonObject load(Path world) {
        Path f = file(world);
        if (!Files.isRegularFile(f)) return new JsonObject();
        try {
            JsonElement e = JsonParser.parseString(Files.readString(f, StandardCharsets.UTF_8));
            return e.isJsonObject() ? e.getAsJsonObject() : new JsonObject();
        } catch (IOException | JsonParseException e) {
            MCPainter.LOGGER.warn("MCPainter: Plan {} nicht lesbar", f, e);
            return new JsonObject();
        }
    }

    static JsonObject save(Path world, byte[] body) {
        String json = new String(body, StandardCharsets.UTF_8);
        try {
            if (!JsonParser.parseString(json).isJsonObject()) throw new ApiException(400, "Plan muss ein JSON-Objekt sein");
        } catch (JsonParseException e) {
            throw new ApiException(400, "Plan ist kein gültiges JSON");
        }
        Path f = file(world);
        try {
            Files.createDirectories(f.getParent());
            // erst in eine Hilfsdatei, dann ersetzen: so bleibt bei einem Absturz der alte Plan erhalten
            Path tmp = f.resolveSibling("plan.json.tmp");
            Files.writeString(tmp, json, StandardCharsets.UTF_8);
            Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new ApiException(500, "Plan nicht gespeichert: " + e.getMessage());
        }
        JsonObject o = new JsonObject();
        o.addProperty("ok", true);
        o.addProperty("bytes", body.length);
        return o;
    }
}
