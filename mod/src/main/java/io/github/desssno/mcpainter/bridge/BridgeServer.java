package io.github.desssno.mcpainter.bridge;

import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.github.desssno.mcpainter.MCPainter;
import net.neoforged.fml.ModList;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Lokaler HTTP-Server, nur an 127.0.0.1 gebunden, zufälliger Port, ein Token pro Sitzung (Konzept Abschnitt 4).
 * Liefert die Web-Seiten aus dem Mod-Jar (Ordner {@code web/}) und die API. Was die API in der Welt tut,
 * steht in {@link Api}; dieser Teil kümmert sich nur um HTTP, Token und CORS.
 */
public final class BridgeServer {
    /** Seiten, die aus dem normalen Browser auf die Brücke zugreifen dürfen (dazu "null" für die Offline-Datei). */
    private static final Set<String> ALLOWED_ORIGINS = Set.of("https://desssno.github.io", "null");
    private static final int MAX_BODY = 64 * 1024 * 1024;
    private static final Map<String, String> MIME = Map.of(
            "html", "text/html; charset=utf-8",
            "js", "text/javascript; charset=utf-8",
            "css", "text/css; charset=utf-8",
            "json", "application/json; charset=utf-8",
            "png", "image/png",
            "svg", "image/svg+xml");

    private static BridgeServer instance;

    private final HttpServer server;
    private final String token;
    private volatile Consumer<String> selftestListener = s -> {};

    private BridgeServer() throws IOException {
        byte[] raw = new byte[16];
        new SecureRandom().nextBytes(raw);
        token = HexFormat.of().formatHex(raw);
        // Fest 127.0.0.1: getLoopbackAddress() liefert je nach JVM-Einstellung ::1, die Seite ruft aber 127.0.0.1 auf
        server = HttpServer.create(new InetSocketAddress(InetAddress.getByAddress(new byte[]{127, 0, 0, 1}), 0), 0);
        server.setExecutor(Executors.newFixedThreadPool(4, r -> {
            Thread t = new Thread(r, "MCPainter-Bridge");
            t.setDaemon(true);
            // Kartenberechnung soll dem Spiel keine Rechenzeit wegnehmen
            t.setPriority(Thread.MIN_PRIORITY);
            return t;
        }));
        server.createContext("/api/", this::handleApi);
        server.createContext("/", this::handleStatic);
        server.start();
        MCPainter.LOGGER.info("MCPainter-Brücke läuft auf http://127.0.0.1:{}/", port());
    }

    /** Startet den Server beim ersten Aufruf. */
    public static synchronized BridgeServer get() {
        if (instance == null) {
            try {
                instance = new BridgeServer();
            } catch (IOException e) {
                throw new IllegalStateException("MCPainter-Brücke konnte nicht starten", e);
            }
        }
        return instance;
    }

    public int port() {
        return server.getAddress().getPort();
    }

    public String token() {
        return token;
    }

    /** Kopplungscode für den externen Browser: Port und Token. */
    public String pairingCode() {
        return port() + "-" + token;
    }

    /** URL einer Seite, mit Token. */
    public String url(String path) {
        return "http://127.0.0.1:" + port() + path + (path.contains("?") ? "&" : "?") + "token=" + token;
    }

    public void onSelftest(Consumer<String> listener) {
        selftestListener = listener;
    }

    // ---------- API ----------

    /** Eine Anfrage an die API: Methode, Pfad, Query-Parameter und Body. */
    public record Request(String method, String path, Map<String, String> query, byte[] body) {
        public String param(String name, String fallback) {
            return query.getOrDefault(name, fallback);
        }

        public int intParam(String name) {
            String v = query.get(name);
            if (v == null) throw new ApiException(400, "Parameter " + name + " fehlt");
            try {
                return Integer.parseInt(v);
            } catch (NumberFormatException e) {
                throw new ApiException(400, "Parameter " + name + " ist keine Zahl");
            }
        }
    }

    /** Fehler mit HTTP-Status, landet als {@code {"error": …}} beim Editor. */
    public static final class ApiException extends RuntimeException {
        public final int status;

        public ApiException(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private boolean authorized(HttpExchange ex) {
        String header = ex.getRequestHeaders().getFirst("X-MCPainter-Token");
        if (token.equals(header)) return true;
        return token.equals(query(ex).get("token"));
    }

    private static Map<String, String> query(HttpExchange ex) {
        Map<String, String> out = new HashMap<>();
        String q = ex.getRequestURI().getRawQuery();
        if (q == null) return out;
        for (String part : q.split("&")) {
            int eq = part.indexOf('=');
            if (eq < 0) continue;
            out.put(URLDecoder.decode(part.substring(0, eq), StandardCharsets.UTF_8),
                    URLDecoder.decode(part.substring(eq + 1), StandardCharsets.UTF_8));
        }
        return out;
    }

    /** CORS nur für die GitHub-Pages-Seite (und die Offline-Datei); Chrome fragt zusätzlich nach privatem Netz. */
    private static void cors(HttpExchange ex) {
        String origin = ex.getRequestHeaders().getFirst("Origin");
        if (origin == null || !ALLOWED_ORIGINS.contains(origin)) return;
        var h = ex.getResponseHeaders();
        h.set("Access-Control-Allow-Origin", origin);
        h.set("Vary", "Origin");
        h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        h.set("Access-Control-Allow-Headers", "X-MCPainter-Token, Content-Type");
        h.set("Access-Control-Max-Age", "600");
        if (ex.getRequestHeaders().containsKey("Access-Control-Request-Private-Network")) {
            h.set("Access-Control-Allow-Private-Network", "true");
        }
    }

    private void handleApi(HttpExchange ex) throws IOException {
        // Achtung: catch muss innerhalb von try (ex) liegen, sonst ist die Verbindung beim Antworten schon zu
        try (ex) {
            handleApiOpen(ex);
        }
    }

    private void handleApiOpen(HttpExchange ex) throws IOException {
        try {
            cors(ex);
            if (ex.getRequestMethod().equals("OPTIONS")) {
                ex.sendResponseHeaders(204, -1);
                return;
            }
            if (!authorized(ex)) {
                sendJson(ex, 401, error("Kein gültiger Token. Im Spiel /mcpainter code eingeben und neu koppeln."));
                return;
            }
            String path = ex.getRequestURI().getPath();
            if (path.equals("/api/selftest") && ex.getRequestMethod().equals("POST")) {
                String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                MCPainter.LOGGER.info("MCPainter-Selbsttest: {}", body);
                selftestListener.accept(body);
                sendJson(ex, 200, ok());
                return;
            }
            byte[] body = new byte[0];
            if (ex.getRequestMethod().equals("POST")) {
                body = ex.getRequestBody().readNBytes(MAX_BODY + 1);
                if (body.length > MAX_BODY) throw new ApiException(413, "Plan zu groß für die Übertragung");
            }
            JsonObject result = Api.handle(new Request(ex.getRequestMethod(), path, query(ex), body));
            sendJson(ex, 200, result);
        } catch (ApiException e) {
            sendJson(ex, e.status, error(e.getMessage()));
        } catch (RuntimeException e) {
            MCPainter.LOGGER.error("MCPainter-Brücke: Fehler bei {}", ex.getRequestURI().getPath(), e);
            sendJson(ex, 500, error("Interner Fehler: " + e));
        }
    }

    private static JsonObject ok() {
        JsonObject o = new JsonObject();
        o.addProperty("ok", true);
        return o;
    }

    private static JsonObject error(String message) {
        JsonObject o = new JsonObject();
        o.addProperty("error", message);
        return o;
    }

    // ---------- statische Dateien ----------

    private void handleStatic(HttpExchange ex) throws IOException {
        try (ex) {
            if (!ex.getRequestMethod().equals("GET")) {
                send(ex, 405, "text/plain", new byte[0]);
                return;
            }
            String path = URI.create(ex.getRequestURI().getRawPath()).normalize().getPath();
            if (path.contains("..") || path.contains("\\")) {
                send(ex, 400, "text/plain", new byte[0]);
                return;
            }
            if (path.endsWith("/")) path += "index.html";
            byte[] data = readWebResource(path);
            if (data == null) {
                MCPainter.LOGGER.warn("MCPainter-Brücke: GET {} → 404", path);
                send(ex, 404, "text/plain; charset=utf-8", ("Nicht gefunden: " + path).getBytes(StandardCharsets.UTF_8));
                return;
            }
            MCPainter.LOGGER.info("MCPainter-Brücke: GET {} → 200 ({} Bytes)", path, data.length);
            String ext = path.substring(path.lastIndexOf('.') + 1);
            ex.getResponseHeaders().set("Cache-Control", "no-store");
            send(ex, 200, MIME.getOrDefault(ext, "application/octet-stream"), data);
        } catch (IOException | RuntimeException e) {
            MCPainter.LOGGER.error("MCPainter-Brücke: Fehler bei {}", ex.getRequestURI().getPath(), e);
            throw e;
        }
    }

    /**
     * Liest eine Datei aus {@code web/} im Mod-Jar. Zuerst über die NeoForge-Moddatei
     * (verlässlich auch im Modulsystem des echten Spiels), sonst über den Klassenpfad.
     */
    private static byte[] readWebResource(String path) throws IOException {
        String[] parts = ("web" + path).split("/");
        var info = ModList.get().getModFileById(MCPainter.MODID);
        if (info != null) {
            Path p = info.getFile().findResource(parts);
            if (Files.isRegularFile(p)) return Files.readAllBytes(p);
        }
        try (InputStream in = BridgeServer.class.getResourceAsStream("/web" + path)) {
            return in == null ? null : in.readAllBytes();
        }
    }

    private static void sendJson(HttpExchange ex, int status, JsonObject body) throws IOException {
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        send(ex, status, "application/json; charset=utf-8", body.toString().getBytes(StandardCharsets.UTF_8));
    }

    private static void send(HttpExchange ex, int status, String type, byte[] data) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.sendResponseHeaders(status, data.length == 0 ? -1 : data.length);
        if (data.length > 0) {
            try (OutputStream out = ex.getResponseBody()) {
                out.write(data);
            }
        }
    }
}
