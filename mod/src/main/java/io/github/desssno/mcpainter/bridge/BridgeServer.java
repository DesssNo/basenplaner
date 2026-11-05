package io.github.desssno.mcpainter.bridge;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import io.github.desssno.mcpainter.MCPainter;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/**
 * Lokaler HTTP-Server, nur an 127.0.0.1 gebunden, zufälliger Port, ein Token pro Sitzung.
 * Liefert die Web-Seiten aus dem Mod-Jar (Ordner {@code web/}) und die API (Konzept Abschnitt 4).
 * Etappe 0: nur statische Dateien und {@code POST /api/selftest}.
 */
public final class BridgeServer {
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
        server.setExecutor(Executors.newFixedThreadPool(2, r -> {
            Thread t = new Thread(r, "MCPainter-Bridge");
            t.setDaemon(true);
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

    /** URL einer Seite, mit Token. */
    public String url(String path) {
        return "http://127.0.0.1:" + port() + path + (path.contains("?") ? "&" : "?") + "token=" + token;
    }

    public void onSelftest(Consumer<String> listener) {
        selftestListener = listener;
    }

    private boolean authorized(HttpExchange ex) {
        String header = ex.getRequestHeaders().getFirst("X-MCPainter-Token");
        if (token.equals(header)) return true;
        String query = ex.getRequestURI().getRawQuery();
        if (query == null) return false;
        for (String part : query.split("&")) {
            if (part.equals("token=" + token)) return true;
        }
        return false;
    }

    private void handleApi(HttpExchange ex) throws IOException {
        try (ex) {
            if (!authorized(ex)) {
                send(ex, 401, "application/json", "{\"error\":\"token\"}");
                return;
            }
            String path = ex.getRequestURI().getPath();
            if (path.equals("/api/selftest") && ex.getRequestMethod().equals("POST")) {
                String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                MCPainter.LOGGER.info("MCPainter-Selbsttest: {}", body);
                selftestListener.accept(body);
                send(ex, 200, "application/json", "{\"ok\":true}");
                return;
            }
            send(ex, 404, "application/json", "{\"error\":\"unbekannt\"}");
        } catch (RuntimeException e) {
            MCPainter.LOGGER.error("Fehler in der MCPainter-Brücke", e);
        }
    }

    private void handleStatic(HttpExchange ex) throws IOException {
        try (ex) {
            if (!ex.getRequestMethod().equals("GET")) {
                send(ex, 405, "text/plain", "");
                return;
            }
            String path = URI.create(ex.getRequestURI().getRawPath()).normalize().getPath();
            if (path.contains("..") || path.contains("\\")) {
                send(ex, 400, "text/plain", "");
                return;
            }
            if (path.endsWith("/")) path += "index.html";
            try (InputStream in = BridgeServer.class.getResourceAsStream("/web" + path)) {
                if (in == null) {
                    send(ex, 404, "text/plain; charset=utf-8", "Nicht gefunden: " + path);
                    return;
                }
                byte[] data = in.readAllBytes();
                String ext = path.substring(path.lastIndexOf('.') + 1);
                ex.getResponseHeaders().set("Content-Type", MIME.getOrDefault(ext, "application/octet-stream"));
                ex.getResponseHeaders().set("Cache-Control", "no-store");
                ex.sendResponseHeaders(200, data.length);
                try (OutputStream out = ex.getResponseBody()) {
                    out.write(data);
                }
            }
        }
    }

    private static void send(HttpExchange ex, int status, String type, String body) throws IOException {
        byte[] data = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", type);
        ex.sendResponseHeaders(status, data.length == 0 ? -1 : data.length);
        if (data.length > 0) {
            try (OutputStream out = ex.getResponseBody()) {
                out.write(data);
            }
        }
    }
}
