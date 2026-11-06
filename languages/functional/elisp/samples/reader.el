;; Reader syntax, not a runnable configuration.
(defvar reader-values
  [#xFF #o77 #b101 #02r10 #24rN 1.25e-3 1.0e+INF 0.0e+NaN
   ?a ?\n ?\C-x ?\M-a ?\M-\C-x ?\N{LATIN CAPITAL LETTER A}])
(defvar reader-record #s(hash-table size 3 data (key value)))
(list #'identity `(one ,value ,@values) #1=(a . #1#) ## #$)
#&8"a" ; a one-byte boolean vector
