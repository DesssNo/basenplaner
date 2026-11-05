package io.github.desssno.mcpainter;

import com.mojang.logging.LogUtils;
import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;

/**
 * Mod-Einstieg. Der Editor (MCEF) und die Brücke leben im Client-Teil, siehe {@link MCPainterClient}.
 */
@Mod(MCPainter.MODID)
public class MCPainter {
    public static final String MODID = "mcpainter";
    public static final Logger LOGGER = LogUtils.getLogger();

    public MCPainter() {
    }
}
