#include <concepts>
#include <vector>

namespace shapes {
template <typename T>
concept Number = std::integral<T> || std::floating_point<T>;

class Shape {
public:
    virtual ~Shape() = default;
    [[nodiscard]] virtual double area() const noexcept = 0;
};

class Square final : public Shape {
    double side_;
public:
    explicit constexpr Square(double side) : side_(side) {}
    [[nodiscard]] double area() const noexcept override { return side_ * side_; }
};

template <Number T>
constexpr auto twice(T value) -> T { return value + value; }
}
