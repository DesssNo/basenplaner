package io.github.desssno.mcpainter;

import com.mojang.logging.LogUtils;
import io.github.desssno.mcpainter.build.BuildManager;
import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;

/**
 * Mod-Einstieg. Die Bau-Engine läuft auf dem (integrierten) Server; Editor (MCEF) und Brücke
 * leben im Client-Teil, siehe {@link MCPainterClient}.
 */
@Mod(MCPainter.MODID)
public class MCPainter {
    public static final String MODID = "mcpainter";
    public static final Logger LOGGER = LogUtils.getLogger();

    public MCPainter() {
        BuildManager.register();
    }
}
