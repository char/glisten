annotation Route
end

macro endpoint(name, path)
  @[Route({{path}})]
  def {{name.id}}(request : HTTP::Request) : String
    {% if flag?(:debug) %}
      puts "debug: #{request.path} ({{name.id}})"
    {% end %}
    {{path}} + request.path
  end
end

lib LibC
  fun puts(message : UInt8*) : Int32
end

struct Config
  property retries : Int32 = 3
end

enum Status
  Ready
  Busy
end

private def inspect_value(value)
  if value.responds_to?(:to_s)
    typeof(value)
  else
    uninitialized Int32
  end
end
