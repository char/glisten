(defn ^:private render [x]
  #_(ignored ["not ]" {:nested '(a b)}] ; a comment
             #_gone :still-discarded)
  [#?(:clj :jvm :cljs :js) #?@(:clj [1 2] :cljs [3])
   #'render @x `(~x ~@x) #"a\\d+\"b" ::local :ns/key
   #_ #_ :inner :outer :kept
   #_^:tag [a b] :after-meta
   #_#inst "2020-01-01" :after-tag
   ##Inf ##-Inf ##NaN #_##Inf :after-symbolic])
