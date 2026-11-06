package example.catalog;

import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** A small immutable catalog of named values. */
public final class Catalog<T extends Number> {
    private final Map<String, T> entries;

    public Catalog(Map<String, T> entries) {
        this.entries = Map.copyOf(entries);
    }

    @Override
    public String toString() {
        return "Catalog: " + entries.size();
    }

    public List<String> names() {
        return entries.keySet().stream()
            .sorted()
            .map(String::trim)
            .toList();
    }

    public <R> List<R> convert(Function<T, R> function) {
        return entries.values().stream()
            .map(value -> function.apply(value))
            .toList();
    }

    public static void main(String[] args) {
        var catalog = new Catalog<>(Map.of("one", 1, "two", 2));
        for (String name : catalog.names()) {
            System.out.println(name);
        }
    }
}
