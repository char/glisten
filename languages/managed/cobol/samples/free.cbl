       >>SOURCE FORMAT FREE
identification division.
program-id. free-example.
data division.
working-storage section.
01 item-count pic 9(5) value 0.
procedure division.
    *> A free-format comment
    perform until item-count >= 10
        add 1 to item-count
        if item-count = 5
            display "It's ""five"""
        end-if
    end-perform
    goback.
