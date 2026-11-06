export module demo.geometry;
import <vector>;
import math.core;

export namespace demo {
[[deprecated("use transform")]]
int old_count(const std::vector<int>& values) {
    auto larger = [&](auto x) -> bool { return x > 10; };
    return static_cast<int>(std::count_if(values.begin(), values.end(), larger));
}

template <typename T> requires requires(T value) { value.size(); }
auto size_of(const T& value) noexcept { return value.size(); }

struct Generator {
    auto next() { co_yield 42; co_return; }
};
}
