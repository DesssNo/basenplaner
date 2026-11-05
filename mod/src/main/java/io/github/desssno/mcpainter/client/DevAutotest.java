package io.github.desssno.mcpainter.client;

import com.cinemamod.mcef.MCEF;
import com.cinemamod.mcef.MCEFBrowser;
import io.github.desssno.mcpainter.MCPainter;
import io.github.desssno.mcpainter.bridge.Api;
import io.github.desssno.mcpainter.bridge.BridgeServer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import org.lwjgl.glfw.GLFW;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;

/**
 * Nur für die Entwicklung: {@code gradlew runClient -Pmcpainter.autotest[=modus]}. Lädt bzw. erstellt die Welt
 * „mcpainter-test“ und prüft dann je nach Modus:
 * <ul>
 *   <li>{@code page} (Standard): Testseite aus Etappe 0 (Eingaben, WebGL, Worker), Ergebnis kommt von der Seite</li>
 *   <li>{@code editor}: Editor aus dem Pausemenü öffnen, Minecraft-Modus prüfen, Esc schließt erst den Dialog, dann den Bildschirm</li>
 *   <li>{@code bridge}: nur die API offen lassen, Zugang in {@code run/mcpainter-dev.txt} (für {@code tools/test-bridge.mjs})</li>
 * </ul>
 */
final class DevAutotest {
    private static final String MODE = System.getProperty("mcpainter.autotest");
    static final boolean ENABLED = MODE != null;
    private static final String WORLD = "mcpainter-test";

    private static int stage;
    private static int wait;
    private static volatile boolean pageReported;
    private static int escStage;
    private static int escTick;

    private DevAutotest() {
    }

    private static String mode() {
        return MODE == null || MODE.isBlank() || MODE.equals("true") ? "page" : MODE;
    }

    static void tick(Minecraft mc) {
        if (!ENABLED || !MCEF.isInitialized()) return;
        switch (stage) {
            case 0 -> {
                if (!(mc.screen instanceof TitleScreen)) return;
                stage = 1;
                BridgeServer.get().onSelftest(result -> pageReported = true);
                if (mc.getLevelSource().levelExists(WORLD)) {
                    MCPainter.LOGGER.info("MCPainter-Autotest: lade Welt {}", WORLD);
                    mc.createWorldOpenFlows().openWorld(WORLD, () -> mc.setScreen(new TitleScreen()));
                } else {
                    MCPainter.LOGGER.info("MCPainter-Autotest: erstelle Welt {}", WORLD);
                    LevelSettings settings = new LevelSettings(WORLD, GameType.CREATIVE, false, Difficulty.PEACEFUL,
                            true, new GameRules(), WorldDataConfiguration.DEFAULT);
                    mc.createWorldOpenFlows().createFreshLevel(WORLD, settings, new WorldOptions(20261105L, false, false),
                            WorldPresets::createNormalWorldDimensions, mc.screen);
                }
            }
            case 1 -> {
                // warten, bis der Spieler in der Welt steht
                if (mc.player == null || mc.level == null || mc.screen != null) return;
                if (++wait < 60) return;
                if (mode().equals("bridge")) {
                    stage = 9;
                    BridgeServer bridge = BridgeServer.get();
                    Api.setDevQuit(() -> mc.execute(mc::stop));
                    try {
                        Files.writeString(mc.gameDirectory.toPath().resolve("mcpainter-dev.txt"), bridge.port() + " " + bridge.token());
                    } catch (IOException e) {
                        throw new UncheckedIOException(e);
                    }
                    MCPainter.LOGGER.info("MCPainter-Autotest: Brücke bereit, Zugang in run/mcpainter-dev.txt");
                    return;
                }
                stage = 2;
                MCPainter.LOGGER.info("MCPainter-Autotest: in der Welt, öffne Pausemenü");
                mc.setScreen(new PauseScreen(true));
            }
            case 2 -> {
                stage = 3;
                MCPainter.LOGGER.info("MCPainter-Autotest: öffne MCPainter aus dem Pausemenü");
                if (mode().equals("editor")) MenuHooks.open("/?autotest=1");
                else MenuHooks.open("/test/");
            }
            case 3 -> {
                // Editor-Modus: Esc-Prüfung, nachdem die Seite ihren Zustand gemeldet hat
                if (mode().equals("editor") && pageReported) editorEscTest(mc);
                else if (mode().equals("page") && pageReported) finish(mc, "Testseite hat ihr Ergebnis gemeldet");
            }
            default -> {
            }
        }
    }

    /** Die Seite hat einen Dialog geöffnet: 1. Esc schließt ihn, 2. Esc (später) schließt den Bildschirm. */
    private static void editorEscTest(Minecraft mc) {
        escTick++;
        switch (escStage) {
            case 0 -> {
                if (escTick < 40) return;
                screenshot(mc);
                pressEsc(mc);
                escStage = 1;
                escTick = 0;
            }
            case 1 -> {
                if (escTick < 20) return;
                boolean open = mc.screen instanceof MCPainterScreen;
                MCPainter.LOGGER.info("MCPainter-Autotest: {} 1. Esc schließt nur den Dialog, Bildschirm offen: {}", open ? "OK  " : "FAIL", open);
                pressEsc(mc);
                escStage = 2;
                escTick = 0;
            }
            case 2 -> {
                if (escTick < 20) return;
                boolean closed = !(mc.screen instanceof MCPainterScreen);
                MCPainter.LOGGER.info("MCPainter-Autotest: {} 2. Esc schließt den Bildschirm: {}", closed ? "OK  " : "FAIL", closed);
                finish(mc, "Editor-Test beendet");
            }
            default -> {
            }
        }
    }

    private static void pressEsc(Minecraft mc) {
        if (mc.screen == null) return;
        mc.screen.keyPressed(GLFW.GLFW_KEY_ESCAPE, 1, 0);
        if (mc.screen != null) mc.screen.keyReleased(GLFW.GLFW_KEY_ESCAPE, 1, 0);
    }

    private static void screenshot(Minecraft mc) {
        Screenshot.grab(mc.gameDirectory, "mcpainter-autotest.png", mc.getMainRenderTarget(),
                msg -> MCPainter.LOGGER.info("MCPainter-Autotest: {}", msg.getString()));
    }

    private static void finish(Minecraft mc, String why) {
        stage = 9;
        MCPainter.LOGGER.info("MCPainter-Autotest fertig ({}), Spiel wird beendet", why);
        mc.stop();
    }

    /** Pro Tick des Bildschirms: Testseite mit simulierten Eingaben füttern, Zeitlimit. */
    static void screenTick(MCPainterScreen screen) {
        if (!ENABLED) return;
        MCEFBrowser browser = screen.browser();
        int t = screen.ticks();
        if (mode().equals("page") && browser != null) {
            if (t == 120) simulateInput(browser);
            if (t == 180) screenshot(Minecraft.getInstance());
        }
        if (t == 1200) {
            MCPainter.LOGGER.error("MCPainter-Autotest: kein Ergebnis nach 60 s, Spiel wird beendet");
            Minecraft.getInstance().stop();
        }
    }

    /** Testseite: zeichnet einen Strich, tippt Text und dreht das Mausrad, als ob ein Spieler es täte. */
    private static void simulateInput(MCEFBrowser browser) {
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
}
