# Variables and nested functions
CC ?= cc
CFLAGS := -Wall -O2
sources ::= main.c util.c
objects = $(patsubst %.c,%.o,$(sources))
export VERSION += 1
private HASH != printf '\#'

define announce
Building $(1)
endef

.PHONY: all clean
all: $(objects) | build
	@echo "building $@ from $^"; printf '%s\n' "$$HOME"
	+$(CC) $(CFLAGS) -o $@ $^ \
	  && echo done

%.o: %.c
	$(CC) -c $< -o $@
$(objects): %.o: %.c ; @echo $(@D) $<
clean:: ; -rm -f $(objects)

ifeq ($(VERSION),1)
include settings.mk
else
-include optional.mk
endif

.RECIPEPREFIX = >
custom: private CC := clang
custom: ; @echo inline
>@echo "custom $@"; echo $$HOME
.RECIPEPREFIX =
back:
	@echo normal
