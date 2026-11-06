# Configure optional components
foreach(component IN ITEMS core tools)
  add_library(${component} INTERFACE)
  target_include_directories(${component} INTERFACE
    "$<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>"
    "$<IF:$<CONFIG:Debug>,debug,release>")
endforeach()

macro(show_environment key)
  message(STATUS "$ENV{${key}} / $CACHE{${key}}")
endmacro()
