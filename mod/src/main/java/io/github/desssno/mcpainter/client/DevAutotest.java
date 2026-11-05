package io.github.desssno.mcpainter.client;

import com.cinemamod.mcef.MCEF;
import io.github.desssno.mcpainter.MCPainter;
import io.github.desssno.mcpainter.bridge.Api;
import io.github.desssno.mcpainter.bridge.BridgeServer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;

/**
 * Nur für die Entwicklung ({@code gradlew runClient -Pmcpainter.autotest}): Lädt bzw. erstellt die Welt
 * „mcpainter-test“, öffnet dort das Pausemenü und dann MCPainter, wie ein Spieler es tut.
 * Die Testseite meldet ihr Ergebnis über die Brücke, danach beendet sich das Spiel.
 */
final class DevAutotest {
    private static final String MODE = System.getProperty("mcpainter.autotest");
    static final boolean ENABLED = MODE != null;
    /** Nur Welt laden und die API offen lassen (für Tests per curl). */
    private static final boolean BRIDGE_ONLY = "bridge".equals(MODE);
    private static final String WORLD = "mcpainter-test";

    private static int stage;
    private static int wait;

    private DevAutotest() {
    }

    static void tick(Minecraft mc) {
        if (!ENABLED || !MCEF.isInitialized()) return;
        switch (stage) {
            case 0 -> {
                if (!(mc.screen instanceof TitleScreen)) return;
                stage = 1;
                BridgeServer.get().onSelftest(result -> mc.execute(() -> {
                    MCPainter.LOGGER.info("MCPainter-Autotest fertig, Spiel wird beendet");
                    mc.stop();
                }));
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
                if (BRIDGE_ONLY) {
                    stage = 3;
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
                MenuHooks.open();
            }
            default -> {
            }
        }
    }
}
