#include <string>
using namespace std::string_literals;

constexpr long double operator""_km(long double value) { return value * 1'000.0L; }
const auto distance = 12.5_km;
const auto binary = 0b1010'0011u;
const auto text = u8"hello\nworld";
const auto symbol = U'\u03bb';
const auto message = "ready"s;
const auto sql = R"sql(select ")wrong\"" /* not a comment */
where x < 3)sql";
const auto long_tag = LR"abcdefghijklmnop(one )abcdefghijklmnox" two)abcdefghijklmnop";
const auto empty = R"(plain \n text)";
