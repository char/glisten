(ns orchard.core
  (:require [clojure.string :as str]))

(defn greeting [person]
  (let [name (str/trim person)]
    (if (empty? name)
      "Hello, stranger!"
      (str "Hello, " name "!"))))

(defn scale [xs factor]
  (map #(* %1 factor) xs))
