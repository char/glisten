;; Host-owned HTML renderer. All pointers are offsets in the host arena.
;; Each span is [exclusive source byte end, style id]. Each 32-byte style
;; entry contains inline open/close bytes, lengths, and pointers for long tags.
;; Each 20-byte group is [start, end, style, value pointer, value length], ordered
;; by start, outermost first, and laminar; each 16-byte group-style entry is
;; [open prefix pointer, prefix length, has attribute]. A group boundary inside a
;; span closes the span's element there and reopens it after the group's tag.
;; The caller reserves enough output for worst-case escaping and tag bytes.
(module
  (import "env" "memory" (memory 1))

  ;; Write the entity for &, <, > or ".
  (func $entity (param $out i32) (param $byte i32) (result i32)
    (if (i32.eq (local.get $byte) (i32.const 38))
      (then
        (i32.store align=1 (local.get $out) (i32.const 0x706d6126))
        (i32.store8 offset=4 (local.get $out) (i32.const 59))
        (return (i32.add (local.get $out) (i32.const 5)))))
    (if (i32.eq (local.get $byte) (i32.const 34))
      (then
        (i32.store align=1 (local.get $out) (i32.const 0x6f757126))
        (i32.store16 offset=4 align=1 (local.get $out) (i32.const 0x3b74))
        (return (i32.add (local.get $out) (i32.const 6)))))
    (i32.store align=1
      (local.get $out)
      (select
        (i32.const 0x3b746c26)
        (i32.const 0x3b746726)
        (i32.eq (local.get $byte) (i32.const 60))))
    (i32.add (local.get $out) (i32.const 4)))

  ;; Copy an attribute value [scan, end), escaping &, <, > and ". Values are short.
  (func $attribute (param $out i32) (param $scan i32) (param $end i32) (result i32)
    (local $byte i32)
    (loop $bytes
      (if (i32.lt_u (local.get $scan) (local.get $end))
        (then
          (local.set $byte (i32.load8_u (local.get $scan)))
          (if
            (i32.or
              (i32.or
                (i32.eq (local.get $byte) (i32.const 38))
                (i32.eq (local.get $byte) (i32.const 34)))
              (i32.or
                (i32.eq (local.get $byte) (i32.const 60))
                (i32.eq (local.get $byte) (i32.const 62))))
            (then (local.set $out (call $entity (local.get $out) (local.get $byte))))
            (else
              (i32.store8 (local.get $out) (local.get $byte))
              (local.set $out (i32.add (local.get $out) (i32.const 1)))))
          (local.set $scan (i32.add (local.get $scan) (i32.const 1)))
          (br $bytes))))
    (local.get $out))

  ;; Write a style entry's open ($close = 0) or close ($close = 4) tag.
  (func $tag (param $out i32) (param $entry i32) (param $close i32) (result i32)
    (local $length i32)
    (local.set $length (i32.load offset=16 (i32.add (local.get $entry) (local.get $close))))
    (if (i32.le_u (local.get $length) (i32.const 8))
      (then
        (i64.store align=1
          (local.get $out)
          (i64.load (i32.add (local.get $entry) (i32.shl (local.get $close) (i32.const 1))))))
      (else
        (memory.copy
          (local.get $out)
          (i32.load offset=24 (i32.add (local.get $entry) (local.get $close)))
          (local.get $length))))
    (i32.add (local.get $out) (local.get $length)))

  ;; Documents without groups: kept separate so its loop carries no group state.
  (func (export "render") (param $source i32) (param $records i32) (param $count i32)
    (param $table i32)
    (param $output i32)
    (result i32)
    (local $i i32)
    (local $start i32)
    (local $end i32)
    (local $entry i32)
    (local $open i32)
    (local $close i32)
    (local $out i32)
    (local $run i32)
    (local $scan i32)
    (local $mask i32)
    (local $byte i32)
    (local $chunk v128)
    (local.set $out (local.get $output))
    (block $done
      (loop $spans
        (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $end (i32.add (local.get $source) (i32.load (local.get $records))))
        (local.set $open (i32.const 0))
        (local.set $close (i32.const 0))
        (if (local.get $table)
          (then
            (local.set $entry
              (i32.add
                (local.get $table)
                (i32.shl (i32.load offset=4 (local.get $records)) (i32.const 5))))
            (local.set $open (i32.load offset=16 (local.get $entry)))
            (local.set $close (i32.load offset=20 (local.get $entry)))))
        (if (local.get $open)
          (then
            (if (i32.le_u (local.get $open) (i32.const 8))
              (then (i64.store align=1 (local.get $out) (i64.load (local.get $entry))))
              (else
                (memory.copy
                  (local.get $out)
                  (i32.load offset=24 (local.get $entry))
                  (local.get $open))))
            (local.set $out (i32.add (local.get $out) (local.get $open)))))
        (block $text_complete
          ;; Short spans avoid vector setup and bulk copies altogether.
          (if
            (i32.lt_u
              (i32.sub (local.get $end) (i32.add (local.get $source) (local.get $start)))
              (i32.const 16))
            (then
              (local.set $scan (i32.add (local.get $source) (local.get $start)))
              ;; Input has 16 readable padding bytes; mask out the following span.
              (if (i32.ge_u (i32.sub (local.get $end) (local.get $scan)) (i32.const 4))
                (then
                  (local.set $chunk (v128.load (local.get $scan)))
                  (local.set $mask
                    (i8x16.bitmask
                      (v128.or
                        (v128.or
                          (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 38)))
                          (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 60))))
                        (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 62))))))
                  (if
                    (i32.eqz
                      (i32.and
                        (local.get $mask)
                        (i32.sub
                          (i32.shl (i32.const 1) (i32.sub (local.get $end) (local.get $scan)))
                          (i32.const 1))))
                    (then
                      (if (i32.ge_u (i32.sub (local.get $end) (local.get $scan)) (i32.const 8))
                        (then
                          (i64.store align=1 (local.get $out) (i64.load align=1 (local.get $scan)))
                          (i64.store align=1
                            (i32.add
                              (local.get $out)
                              (i32.sub (i32.sub (local.get $end) (local.get $scan)) (i32.const 8)))
                            (i64.load align=1 (i32.sub (local.get $end) (i32.const 8)))))
                        (else
                          (i32.store align=1 (local.get $out) (i32.load align=1 (local.get $scan)))
                          (i32.store align=1
                            (i32.add
                              (local.get $out)
                              (i32.sub (i32.sub (local.get $end) (local.get $scan)) (i32.const 4)))
                            (i32.load align=1 (i32.sub (local.get $end) (i32.const 4))))))
                      (local.set $out
                        (i32.add (local.get $out) (i32.sub (local.get $end) (local.get $scan))))
                      (br $text_complete)))))
              (loop $short
                (br_if $text_complete (i32.ge_u (local.get $scan) (local.get $end)))
                (local.set $byte (i32.load8_u (local.get $scan)))
                (if (i32.eq (local.get $byte) (i32.const 38))
                  (then
                    (i32.store align=1 (local.get $out) (i32.const 0x706d6126))
                    (i32.store8 offset=4 (local.get $out) (i32.const 59))
                    (local.set $out (i32.add (local.get $out) (i32.const 5))))
                  (else
                    (if
                      (i32.or
                        (i32.eq (local.get $byte) (i32.const 60))
                        (i32.eq (local.get $byte) (i32.const 62)))
                      (then
                        (i32.store align=1
                          (local.get $out)
                          (select
                            (i32.const 0x3b746c26)
                            (i32.const 0x3b746726)
                            (i32.eq (local.get $byte) (i32.const 60))))
                        (local.set $out (i32.add (local.get $out) (i32.const 4))))
                      (else
                        (i32.store8 (local.get $out) (local.get $byte))
                        (local.set $out (i32.add (local.get $out) (i32.const 1)))))))
                (local.set $scan (i32.add (local.get $scan) (i32.const 1)))
                (br $short))))
          ;; Vector loads never cross the span boundary, even if padding is available.
          (local.set $run (i32.add (local.get $source) (local.get $start)))
          (local.set $scan (local.get $run))
          (block $text_done
            (loop $text
              (block $found
                (block $scalar
                  (loop $vectors
                    (br_if $scalar
                      (i32.lt_u (i32.sub (local.get $end) (local.get $scan)) (i32.const 16)))
                    (local.set $chunk (v128.load (local.get $scan)))
                    (local.set $mask
                      (i8x16.bitmask
                        (v128.or
                          (v128.or
                            (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 38)))
                            (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 60))))
                          (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 62))))))
                    (if (local.get $mask)
                      (then
                        (local.set $scan (i32.add (local.get $scan) (i32.ctz (local.get $mask))))
                        (br $found)))
                    (local.set $scan (i32.add (local.get $scan) (i32.const 16)))
                    (br $vectors)))
                (loop $tail
                  (br_if $found (i32.ge_u (local.get $scan) (local.get $end)))
                  (local.set $byte (i32.load8_u (local.get $scan)))
                  (br_if $found
                    (i32.or
                      (i32.eq (local.get $byte) (i32.const 38))
                      (i32.or
                        (i32.eq (local.get $byte) (i32.const 60))
                        (i32.eq (local.get $byte) (i32.const 62)))))
                  (local.set $scan (i32.add (local.get $scan) (i32.const 1)))
                  (br $tail)))
              (memory.copy
                (local.get $out)
                (local.get $run)
                (i32.sub (local.get $scan) (local.get $run)))
              (local.set $out
                (i32.add (local.get $out) (i32.sub (local.get $scan) (local.get $run))))
              (br_if $text_done (i32.ge_u (local.get $scan) (local.get $end)))
              (local.set $byte (i32.load8_u (local.get $scan)))
              (if (i32.eq (local.get $byte) (i32.const 38))
                (then
                  (i32.store align=1 (local.get $out) (i32.const 0x706d6126))
                  (i32.store8 offset=4 (local.get $out) (i32.const 59))
                  (local.set $out (i32.add (local.get $out) (i32.const 5))))
                (else
                  (i32.store align=1
                    (local.get $out)
                    (select
                      (i32.const 0x3b746c26)
                      (i32.const 0x3b746726)
                      (i32.eq (local.get $byte) (i32.const 60))))
                  (local.set $out (i32.add (local.get $out) (i32.const 4)))))
              (local.set $scan (i32.add (local.get $scan) (i32.const 1)))
              (local.set $run (local.get $scan))
              (br $text))))
        (if (local.get $close)
          (then
            (if (i32.le_u (local.get $close) (i32.const 8))
              (then (i64.store align=1 (local.get $out) (i64.load offset=8 (local.get $entry))))
              (else
                (memory.copy
                  (local.get $out)
                  (i32.load offset=28 (local.get $entry))
                  (local.get $close))))
            (local.set $out (i32.add (local.get $out) (local.get $close)))))
        (local.set $start (i32.load (local.get $records)))
        (local.set $records (i32.add (local.get $records) (i32.const 8)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $spans)))
    (i32.sub (local.get $out) (local.get $output)))

  ;; Documents with groups.
  (func (export "renderGroups") (param $source i32) (param $records i32) (param $count i32)
    (param $table i32)
    (param $output i32)
    (param $groups i32)
    (param $groupsEnd i32)
    (param $groupTable i32)
    (param $stack i32)
    (result i32)
    (local $i i32)
    (local $start i32)
    (local $end i32)
    (local $piece i32)
    (local $entry i32)
    (local $open i32)
    (local $close i32)
    (local $out i32)
    (local $sp i32)
    (local $top i32)
    (local $group i32)
    (local $value i32)
    (local $next i32)
    (local $scan i32)
    (local $limit i32)
    (local $run i32)
    (local $mask i32)
    (local $byte i32)
    (local $chunk v128)
    (local.set $out (local.get $output))
    (local.set $sp (local.get $stack))
    ;; The innermost open group's end, or "never" when none is open.
    (local.set $top (i32.const -1))
    ;; The next position with a group event: the innermost end or the next start.
    (local.set $next
      (select
        (i32.load (local.get $groups))
        (i32.const -1)
        (i32.lt_u (local.get $groups) (local.get $groupsEnd))))
    (block $done
      (loop $spans
        (br_if $done (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $end (i32.load (local.get $records)))
        (local.set $open (i32.const 0))
        (local.set $close (i32.const 0))
        (if (local.get $table)
          (then
            (local.set $entry
              (i32.add
                (local.get $table)
                (i32.shl (i32.load offset=4 (local.get $records)) (i32.const 5))))
            (local.set $open (i32.load offset=16 (local.get $entry)))
            (local.set $close (i32.load offset=20 (local.get $entry)))))
        (loop $pieces
          (if (i32.eq (local.get $start) (local.get $next))
            (then
              ;; Close groups ending here, then open groups starting here.
              (loop $closes
                (if (i32.eq (local.get $top) (local.get $start))
                  (then
                    (local.set $sp (i32.sub (local.get $sp) (i32.const 4)))
                    (local.set $out
                      (call $tag
                        (local.get $out)
                        (i32.add
                          (local.get $table)
                          (i32.shl (i32.load offset=8 (i32.load (local.get $sp))) (i32.const 5)))
                        (i32.const 4)))
                    (local.set $top
                      (if (result i32) (i32.eq (local.get $sp) (local.get $stack))
                        (then (i32.const -1))
                        (else
                          (i32.load offset=4 (i32.load (i32.sub (local.get $sp) (i32.const 4)))))))
                    (br $closes))))
              (loop $opens
                (if
                  (i32.and
                    (i32.lt_u (local.get $groups) (local.get $groupsEnd))
                    (i32.eq (i32.load (local.get $groups)) (local.get $start)))
                  (then
                    (local.set $group
                      (i32.add
                        (local.get $groupTable)
                        (i32.shl (i32.load offset=8 (local.get $groups)) (i32.const 4))))
                    (memory.copy
                      (local.get $out)
                      (i32.load (local.get $group))
                      (i32.load offset=4 (local.get $group)))
                    (local.set $out
                      (i32.add (local.get $out) (i32.load offset=4 (local.get $group))))
                    (if (i32.load offset=8 (local.get $group))
                      (then
                        (local.set $value (i32.load offset=12 (local.get $groups)))
                        (local.set $out
                          (call $attribute
                            (local.get $out)
                            (local.get $value)
                            (i32.add (local.get $value) (i32.load offset=16 (local.get $groups)))))
                        (i32.store8 (local.get $out) (i32.const 34))
                        (local.set $out (i32.add (local.get $out) (i32.const 1)))))
                    (i32.store8 (local.get $out) (i32.const 62))
                    (local.set $out (i32.add (local.get $out) (i32.const 1)))
                    (i32.store (local.get $sp) (local.get $groups))
                    (local.set $sp (i32.add (local.get $sp) (i32.const 4)))
                    (local.set $top (i32.load offset=4 (local.get $groups)))
                    (local.set $groups (i32.add (local.get $groups) (i32.const 20)))
                    (br $opens))))
              (local.set $next (local.get $top))
              (if (i32.lt_u (local.get $groups) (local.get $groupsEnd))
                (then
                  (if (i32.lt_u (i32.load (local.get $groups)) (local.get $next))
                    (then (local.set $next (i32.load (local.get $groups)))))))))
          (local.set $piece
            (select
              (local.get $next)
              (local.get $end)
              (i32.lt_u (local.get $next) (local.get $end))))
          (if (local.get $open)
            (then
              (if (i32.le_u (local.get $open) (i32.const 8))
                (then (i64.store align=1 (local.get $out) (i64.load (local.get $entry))))
                (else
                  (memory.copy
                    (local.get $out)
                    (i32.load offset=24 (local.get $entry))
                    (local.get $open))))
              (local.set $out (i32.add (local.get $out) (local.get $open)))))
          (local.set $scan (i32.add (local.get $source) (local.get $start)))
          (local.set $limit (i32.add (local.get $source) (local.get $piece)))
          (block $text_complete
            ;; Short runs avoid vector setup and bulk copies altogether.
            (if (i32.lt_u (i32.sub (local.get $limit) (local.get $scan)) (i32.const 16))
              (then
                (loop $short
                  (br_if $text_complete (i32.ge_u (local.get $scan) (local.get $limit)))
                  (local.set $byte (i32.load8_u (local.get $scan)))
                  (if
                    (i32.or
                      (i32.eq (local.get $byte) (i32.const 38))
                      (i32.or
                        (i32.eq (local.get $byte) (i32.const 60))
                        (i32.eq (local.get $byte) (i32.const 62))))
                    (then (local.set $out (call $entity (local.get $out) (local.get $byte))))
                    (else
                      (i32.store8 (local.get $out) (local.get $byte))
                      (local.set $out (i32.add (local.get $out) (i32.const 1)))))
                  (local.set $scan (i32.add (local.get $scan) (i32.const 1)))
                  (br $short))))
            ;; Vector loads never cross the run's end, even if padding is available.
            (local.set $run (local.get $scan))
            (loop $text
              (block $found
                (block $scalar
                  (loop $vectors
                    (br_if $scalar
                      (i32.lt_u (i32.sub (local.get $limit) (local.get $scan)) (i32.const 16)))
                    (local.set $chunk (v128.load (local.get $scan)))
                    (local.set $mask
                      (i8x16.bitmask
                        (v128.or
                          (v128.or
                            (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 38)))
                            (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 60))))
                          (i8x16.eq (local.get $chunk) (i8x16.splat (i32.const 62))))))
                    (if (local.get $mask)
                      (then
                        (local.set $scan (i32.add (local.get $scan) (i32.ctz (local.get $mask))))
                        (br $found)))
                    (local.set $scan (i32.add (local.get $scan) (i32.const 16)))
                    (br $vectors)))
                (loop $tail
                  (br_if $found (i32.ge_u (local.get $scan) (local.get $limit)))
                  (local.set $byte (i32.load8_u (local.get $scan)))
                  (br_if $found
                    (i32.or
                      (i32.eq (local.get $byte) (i32.const 38))
                      (i32.or
                        (i32.eq (local.get $byte) (i32.const 60))
                        (i32.eq (local.get $byte) (i32.const 62)))))
                  (local.set $scan (i32.add (local.get $scan) (i32.const 1)))
                  (br $tail)))
              (memory.copy
                (local.get $out)
                (local.get $run)
                (i32.sub (local.get $scan) (local.get $run)))
              (local.set $out
                (i32.add (local.get $out) (i32.sub (local.get $scan) (local.get $run))))
              (br_if $text_complete (i32.ge_u (local.get $scan) (local.get $limit)))
              (local.set $out (call $entity (local.get $out) (i32.load8_u (local.get $scan))))
              (local.set $scan (i32.add (local.get $scan) (i32.const 1)))
              (local.set $run (local.get $scan))
              (br $text)))
          (if (local.get $close)
            (then
              (if (i32.le_u (local.get $close) (i32.const 8))
                (then (i64.store align=1 (local.get $out) (i64.load offset=8 (local.get $entry))))
                (else
                  (memory.copy
                    (local.get $out)
                    (i32.load offset=28 (local.get $entry))
                    (local.get $close))))
              (local.set $out (i32.add (local.get $out) (local.get $close)))))
          (local.set $start (local.get $piece))
          (br_if $pieces (i32.lt_u (local.get $start) (local.get $end))))
        (local.set $records (i32.add (local.get $records) (i32.const 8)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $spans)))
    (loop $remaining
      (if (i32.gt_u (local.get $sp) (local.get $stack))
        (then
          (local.set $sp (i32.sub (local.get $sp) (i32.const 4)))
          (local.set $out
            (call $tag
              (local.get $out)
              (i32.add
                (local.get $table)
                (i32.shl (i32.load offset=8 (i32.load (local.get $sp))) (i32.const 5)))
              (i32.const 4)))
          (br $remaining))))
    (i32.sub (local.get $out) (local.get $output))))
