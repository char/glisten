package example.shapes;

sealed interface Shape permits Circle, Rectangle {
    double area();
}

record Circle(double radius) implements Shape {
    public double area() {
        return Math.PI * radius * radius;
    }
}

non-sealed class Rectangle implements Shape {
    final double width;
    final double height;

    Rectangle(double width, double height) {
        this.width = width;
        this.height = height;
    }

    public double area() {
        var result = width * height;
        return result;
    }

    static int score(int choice) {
        return switch (choice) {
            case 1: yield 10;
            case 2: yield 20;
            default: yield 0;
        };
    }

    void display(Iterable<String> names) {
        for (var name : names) {
            System.out.println(name);
        }
    }
}
