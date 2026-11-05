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
import org.cef.CefSettings;
import org.cef.browser.CefBrowser;
import org.cef.browser.CefFrame;
import org.cef.handler.CefDisplayHandlerAdapter;
import org.cef.handler.CefLoadHandler;
import org.cef.handler.CefLoadHandlerAdapter;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.network.chat.Component;
import org.lwjgl.glfw.GLFW;

/**
 * Vollbild-Browser (MCEF). Leitet Maus, Mausrad und Tastatur an Chromium weiter.
 */
public class MCPainterScreen extends Screen {
    private final String url;
    private MCEFBrowser browser;
    private int ticks;

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
        browser = MCEF.createBrowser(url, false);
        resizeBrowser();
    }

    private void resizeBrowser() {
        if (browser == null) return;
        Window w = minecraft.getWindow();
        if (w.getWidth() > 0 && w.getHeight() > 0) browser.resize(w.getWidth(), w.getHeight());
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
        if (MenuHooks.AUTOTEST && browser != null && ticks == 120) simulateInput();
        if (MenuHooks.AUTOTEST && ticks == 1200) {
            MCPainter.LOGGER.error("MCPainter-Autotest: kein Ergebnis nach 60 s, Spiel wird beendet");
            minecraft.stop();
        }
    }

    /** Autotest: zeichnet einen Strich, tippt Text und dreht das Mausrad, als ob ein Spieler es täte. */
    private void simulateInput() {
        MCPainter.LOGGER.info("MCPainter-Autotest: simuliere Eingaben");
        browser.setFocus(true);
        browser.sendMouseMove(60, 140);
        browser.sendMousePress(60, 140, 0);
        for (int i = 1; i <= 20; i++) browser.sendMouseMove(60 + i * 12, 140 + i * 5);
        browser.sendMouseRelease(300, 240, 0);
        // Rechtsklick (Minecraft-Taste 1) auf die Zeichenfläche
        browser.sendMousePress(100, 200, 1);
        browser.sendMouseRelease(100, 200, 1);
        browser.sendMouseWheel(200, 200, -1, 0);
        // ins Textfeld klicken und tippen, in der Reihenfolge, in der Minecraft die Ereignisse liefert
        browser.sendMousePress(100, 417, 0);
        browser.sendMouseRelease(100, 417, 0);
        for (char c : "Mä".toCharArray()) {
            int key = c == 'M' ? GLFW.GLFW_KEY_M : GLFW.GLFW_KEY_APOSTROPHE;
            browser.sendKeyPress(key, 0, c == 'M' ? GLFW.GLFW_MOD_SHIFT : 0);
            browser.sendKeyTyped(c, 0);
            browser.sendKeyRelease(key, 0, 0);
        }
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
        if (browser != null) browser.sendMouseMove(px(x), py(y));
    }

    @Override
    public boolean mouseClicked(double x, double y, int button) {
        if (browser == null) return false;
        browser.setFocus(true);
        browser.sendMousePress(px(x), py(y), button);
        return true;
    }

    @Override
    public boolean mouseReleased(double x, double y, int button) {
        if (browser == null) return false;
        browser.sendMouseRelease(px(x), py(y), button);
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
        // Esc schließt den Bildschirm (ab Etappe 2: erst Dialoge im Editor, dann den Bildschirm)
        if (keyCode == GLFW.GLFW_KEY_ESCAPE) return super.keyPressed(keyCode, scanCode, mods);
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
