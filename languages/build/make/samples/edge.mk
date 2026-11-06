# A conditional may occur between a target and its recipe.
.PHONY: show
show: input | directory
ifeq ($(MODE),debug)
	-@printf '%s\n' '$(@D)' "$(shell echo nested)" $$HOME \
	  && echo $< $? $*
else
	+echo release
endif

define outer
define inner
$(1) and ${other}
endef
$(call inner,$@)
endef

name = escaped\#hash # comment
name += extra
name != printf value
include included.mk
sinclude optional.mk
