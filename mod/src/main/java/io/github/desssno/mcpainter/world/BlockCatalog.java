package io.github.desssno.mcpainter.world;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.github.desssno.mcpainter.MCPainter;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.phys.shapes.VoxelShape;
import net.neoforged.fml.ModList;

import java.util.Locale;
import java.util.Set;

/**
 * Alle registrierten Blöcke des Modpacks für die Editor-Palette (Konzept Abschnitt 6):
 * ID, Anzeigename in der Spielsprache, Mod, Kartenfarbe, Durchsichtigkeit, Form und Zustände.
 */
public final class BlockCatalog {
    private static final Set<String> SKIP = Set.of("minecraft:air", "minecraft:cave_air", "minecraft:void_air", "minecraft:moving_piston");
    private static JsonObject cached;

    private BlockCatalog() {
    }

    /** Wird einmal berechnet (die Registry ändert sich im laufenden Spiel nicht). */
    public static synchronized JsonObject get() {
        if (cached == null) cached = build();
        return cached;
    }

    public static String modName(String namespace) {
        if (namespace.equals("minecraft")) return "Minecraft";
        return ModList.get().getModContainerById(namespace).map(c -> c.getModInfo().getDisplayName()).orElse(namespace);
    }

    private static JsonObject build() {
        JsonArray blocks = new JsonArray();
        int failed = 0;
        for (Block block : BuiltInRegistries.BLOCK) {
            ResourceLocation id = BuiltInRegistries.BLOCK.getKey(block);
            if (SKIP.contains(id.toString())) continue;
            JsonObject o = new JsonObject();
            o.addProperty("id", id.toString());
            o.addProperty("name", block.getName().getString());
            o.addProperty("mod", modName(id.getNamespace()));
            o.addProperty("item", block.asItem() != Items.AIR);
            BlockState state = block.defaultBlockState();
            try {
                MapColor color = state.getMapColor(EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
                if (color != MapColor.NONE) o.addProperty("color", String.format(Locale.ROOT, "#%06x", color.col & 0xffffff));
                o.addProperty("transparent", !state.canOcclude());
                VoxelShape shape = state.getShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO);
                o.addProperty("full", state.isCollisionShapeFullBlock(EmptyBlockGetter.INSTANCE, BlockPos.ZERO));
                if (!shape.isEmpty()) {
                    JsonArray box = new JsonArray();
                    var b = shape.bounds();
                    for (double v : new double[]{b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ}) box.add(Math.round(v * 1000) / 1000.0);
                    o.add("box", box);
                }
            } catch (RuntimeException e) {
                // manche Mod-Blöcke erwarten eine echte Welt; dann eben ohne Form und Farbe
                failed++;
            }
            if (!state.getProperties().isEmpty()) {
                JsonObject props = new JsonObject();
                for (Property<?> p : state.getProperties()) {
                    JsonArray values = new JsonArray();
                    for (Object v : p.getPossibleValues()) values.add(name(p, v));
                    props.add(p.getName(), values);
                }
                o.add("states", props);
            }
            blocks.add(o);
        }
        JsonObject out = new JsonObject();
        out.add("blocks", blocks);
        MCPainter.LOGGER.info("MCPainter: Block-Katalog mit {} Blöcken ({} ohne Form)", blocks.size(), failed);
        return out;
    }

    @SuppressWarnings("unchecked")
    private static <T extends Comparable<T>> String name(Property<T> p, Object v) {
        return p.getName((T) v);
    }
}
