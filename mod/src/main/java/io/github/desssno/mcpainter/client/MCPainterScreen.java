package io.github.desssno.mcpainter.client;

import com.cinemamod.mcef.MCEF;
import com.cinemamod.mcef.MCEFBrowser;
import com.mojang.blaze3d.platform.Window;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.BufferBuilder;
import com.mojang.blaze3d.vertex.BufferUploader;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.blaze3d.vertex.Tesselator;
import com.mojang.blaze3d.vertex.VertexFormat;
import io.github.desssno.mcpainter.MCPainter;
import io.github.desssno.mcpainter.bridge.BridgeServer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.network.chat.Component;
import org.cef.CefSettings;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.handler.CefDisplayHandlerAdapter;
import org.cef.handler.CefLoadHandler;
import org.cef.handler.CefLoadHandlerAdapter;
import org.lwjgl.glfw.GLFW;

/**
 * Vollbild-Browser (MCEF) mit dem Editor. Leitet Maus, Mausrad und Tastatur an Chromium weiter.
 * <p>
 * Esc geht zuerst an die Seite: Sie schließt damit ihre Dialoge und meldet über {@code /api/ui/close},
 * wenn der Bildschirm zugehen soll. Sicherheitsnetz: Hat sich die Seite nicht als bereit gemeldet
 * ({@code /api/ui/ready}) oder kommt Esc zweimal schnell hintereinander, schließt der Bildschirm sofort.
 */
public class MCPainterScreen extends Screen {
    private static final long DOUBLE_ESC_MS = 400;

    private final String url;
    private EditorBrowser browser;
    private int ticks;
    private boolean zoomApplied;
    private long lastEsc;
    private volatile boolean pageReady;

    public MCPainterScreen(String url) {
        super(Component.translatable("mcpainter.screen.title"));
        this.url = url;
    }

    @Override
    protected void init() {
        super.init();
        createBrowserIfReady();
        resizeBrowser();
    }

    private static boolean handlersInstalled;

    /** Konsolenmeldungen und Ladefehler unserer Seiten landen im Minecraft-Log. */
    private static void installHandlers() {
        if (handlersInstalled) return;
        handlersInstalled = true;
        String base = "http://127.0.0.1:" + BridgeServer.get().port() + "/";
        MCEF.getClient().addDisplayHandler(new CefDisplayHandlerAdapter() {
            @Override
            public boolean onConsoleMessage(CefBrowser b, CefSettings.LogSeverity level, String message, String source, int line) {
                if (source != null && source.startsWith(base)) {
                    MCPainter.LOGGER.info("[Seite {}] {} ({}:{})", level, message, source.substring(base.length() - 1).replaceAll("\\?.*", ""), line);
                }
                return false;
            }
        });
        MCEF.getClient().addLoadHandler(new CefLoadHandlerAdapter() {
            @Override
            public void onLoadError(CefBrowser b, CefFrame frame, CefLoadHandler.ErrorCode code, String text, String url) {
                if (url != null && url.startsWith(base)) MCPainter.LOGGER.error("MCPainter-Seite lädt nicht: {} {}", code, text);
            }
        });
    }

    private void createBrowserIfReady() {
        if (browser != null || !MCEF.isInitialized()) return;
        installHandlers();
        MCPainter.LOGGER.info("MCPainter öffnet {}", url.replaceAll("token=[0-9a-f]+", "token=…"));
        browser = EditorBrowser.create(url);
        // Strg + / Strg − / Strg 0 zoomen, Strg R lädt neu
        browser.useBrowserControls(true);
        resizeBrowser();
    }

    private void resizeBrowser() {
        if (browser == null) return;
        Window w = minecraft.getWindow();
        if (w.getWidth() > 0 && w.getHeight() > 0) browser.resize(w.getWidth(), w.getHeight());
    }

    /**
     * Zoom wie im normalen Browser: Windows-Skalierung (z. B. 150 %) übernehmen,
     * sonst wäre die Oberfläche auf hochauflösenden Bildschirmen winzig.
     */
    private void applyZoom() {
        float[] xs = new float[1], ys = new float[1];
        GLFW.glfwGetWindowContentScale(minecraft.getWindow().getWindow(), xs, ys);
        double scale = Math.max(1.0, xs[0]);
        // Chromium: Faktor = 1,2 ^ Stufe
        browser.setZoomLevel(Math.log(scale) / Math.log(1.2));
        MCPainter.LOGGER.info("MCPainter: Zoom {} % (Windows-Skalierung)", Math.round(scale * 100));
    }

    @Override
    public void resize(Minecraft mc, int width, int height) {
        super.resize(mc, width, height);
        resizeBrowser();
    }

    @Override
    public void tick() {
        ticks++;
        // MCEF lädt beim ersten Start Chromium herunter; so lange warten wir.
        createBrowserIfReady();
        if (browser != null && !zoomApplied && !browser.isLoading()) {
            zoomApplied = true;
            applyZoom();
        }
        DevAutotest.screenTick(this);
    }

    MCEFBrowser browser() {
        return browser;
    }

    int ticks() {
        return ticks;
    }

    /** Die Seite hat sich gemeldet und kümmert sich ab jetzt selbst um Esc. */
    public void markReady() {
        pageReady = true;
    }

    public boolean isPageReady() {
        return pageReady;
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        // kein Weichzeichner und keine Abdunklung: der Browser deckt alles ab
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        if (browser == null) {
            g.fill(0, 0, width, height, 0xFF1E1E1E);
            g.drawCenteredString(font, Component.translatable("mcpainter.screen.loading"), width / 2, height / 2, 0xFFFFFF);
            return;
        }
        RenderSystem.disableDepthTest();
        RenderSystem.setShader(GameRenderer::getPositionTexColorShader);
        RenderSystem.setShaderTexture(0, browser.getRenderer().getTextureID());
        BufferBuilder b = Tesselator.getInstance().begin(VertexFormat.Mode.QUADS, DefaultVertexFormat.POSITION_TEX_COLOR);
        b.addVertex(0, height, 0).setUv(0f, 1f).setColor(255, 255, 255, 255);
        b.addVertex(width, height, 0).setUv(1f, 1f).setColor(255, 255, 255, 255);
        b.addVertex(width, 0, 0).setUv(1f, 0f).setColor(255, 255, 255, 255);
        b.addVertex(0, 0, 0).setUv(0f, 0f).setColor(255, 255, 255, 255);
        BufferUploader.drawWithShader(b.buildOrThrow());
        RenderSystem.setShaderTexture(0, 0);
        RenderSystem.enableDepthTest();
    }

    @Override
    public boolean isPauseScreen() {
        // Das Spiel läuft weiter, damit ein Bau im Hintergrund vorankommt
        return false;
    }

    @Override
    public void removed() {
        if (browser != null) {
            browser.close();
            browser = null;
        }
        super.removed();
    }

    // Eingaben: GUI-Koordinaten in Fensterpixel umrechnen

    private int px(double x) {
        return (int) (x * minecraft.getWindow().getWidth() / width);
    }

    private int py(double y) {
        return (int) (y * minecraft.getWindow().getHeight() / height);
    }

    private static int modifiers() {
        int m = 0;
        if (hasShiftDown()) m |= GLFW.GLFW_MOD_SHIFT;
        if (hasControlDown()) m |= GLFW.GLFW_MOD_CONTROL;
        if (hasAltDown()) m |= GLFW.GLFW_MOD_ALT;
        return m;
    }

    @Override
    public void mouseMoved(double x, double y) {
        if (browser != null) browser.mouseMove(px(x), py(y), modifiers());
    }

    @Override
    public boolean mouseClicked(double x, double y, int button) {
        if (browser == null) return false;
        browser.setFocus(true);
        browser.mousePress(px(x), py(y), button, modifiers());
        return true;
    }

    @Override
    public boolean mouseReleased(double x, double y, int button) {
        if (browser == null) return false;
        browser.mouseRelease(px(x), py(y), button, modifiers());
        return true;
    }

    @Override
    public boolean mouseDragged(double x, double y, int button, double dx, double dy) {
        // Bewegungen kommen schon über mouseMoved an
        return browser != null;
    }

    @Override
    public boolean mouseScrolled(double x, double y, double scrollX, double scrollY) {
        if (browser == null) return false;
        browser.sendMouseWheel(px(x), py(y), scrollY, modifiers());
        return true;
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int mods) {
        if (keyCode == GLFW.GLFW_KEY_ESCAPE) {
            long now = System.currentTimeMillis();
            boolean doubleEsc = now - lastEsc < DOUBLE_ESC_MS;
            lastEsc = now;
            if (browser == null || !pageReady || doubleEsc) {
                MCPainter.LOGGER.info("MCPainter: Esc schließt direkt ({})", browser == null ? "kein Browser" : !pageReady ? "Seite nicht bereit" : "doppeltes Esc");
                onClose();
                return true;
            }
        }
        if (browser == null) return false;
        browser.setFocus(true);
        browser.sendKeyPress(keyCode, scanCode, mods);
        return true;
    }

    @Override
    public boolean keyReleased(int keyCode, int scanCode, int mods) {
        if (browser == null) return false;
        browser.sendKeyRelease(keyCode, scanCode, mods);
        return true;
    }

    @Override
    public boolean charTyped(char c, int mods) {
        if (browser == null || c == 0) return false;
        browser.sendKeyTyped(c, mods);
        return true;
    }
}
