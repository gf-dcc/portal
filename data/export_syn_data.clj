(require '[babashka.cli :as cli])
(require '[babashka.http-client :as http])
(require '[cheshire.core :as json])
(require '[clojure.string :as str])
(require '[clojure.java.io :as io])
(require '[clojure.set :as cset])
(:import java.util.zip.GZIPInputStream
         java.util.zip.GZIPOutputStream)

(def cli-opts {:output {:desc "Base output file."
                        :default "public/processed_syn_data.json"}
               :no-gz {:desc "Don't gzip the output."}})

;(println (cli/format-opts {:spec cli-opts}))

(def opts (cli/parse-opts *command-line-args* {:spec cli-opts}))

(def token (System/getenv "SYNAPSE_SERVICE_TOKEN"))
(def atlas-tb "syn51755925")
(def dataset-tb "syn27608832")
(def clinical-tb "syn51857871")
(def file-tb "syn28142805")
(def entity-endpoint "https://repo-prod.prod.sagebase.org/repo/v1/entity/")

(declare query-table-parse)

; gzip utils
(defn gunzip
  "Decompress data.
    input: gzipped file that can be opened by io/input-stream.
    output: something that can be copied to by io/copy (e.g. filename ...)."
  [input output & opts]
  (with-open [input (-> input io/input-stream java.util.zip.GZIPInputStream.)]
    (apply io/copy input output opts)))

(defn gzip
  "Compress data.
    input: something that can be copied using io/copy (e.g. filename ...).
    output: something that can be opened by io/output-stream. Bytes written to the resulting stream will be gzip compressed."
  [input output & opts]
  (with-open [input (-> (io/input-stream input))
              output (-> output io/output-stream java.util.zip.GZIPOutputStream.)]
    (apply io/copy input output opts)))

; Synapse API stuff
(defn query-bundle
  ([id] (query-bundle id {:sql (str "SELECT * FROM " id)}))
  ([id query-map]
  {:concreteType "org.sagebionetworks.repo.model.table.QueryBundleRequest"
   :entityId id
   :query query-map}))

(defn get-query-result [id async-token next?]
   (let [url (str entity-endpoint id "/table/query" (if next? "/nextPage" nil) "/async/get/" async-token)]
    (http/get url {:headers {:Content-type "application/json" :Authorization (str "Bearer " token)}})))

(defn post-query-table [id query-body next?]
   (let [url (str entity-endpoint id "/table/query" (if next? "/nextPage" nil) "/async/start")]
    (http/post url {:headers {:Content-type "application/json" :Authorization (str "Bearer " token)}
                    :body (json/encode query-body)})))

(defn result-map [body]
  (let [[header-data row-data]
        (if (body :queryResult)
          [(get-in body [:queryResult :queryResults :headers]) (get-in body [:queryResult :queryResults :rows])]
          [(get-in body [:queryResults :headers]) (get-in body [:queryResults :rows])])
        headers (map #(keyword (:name %)) header-data)
        rows (map #(get % :values) row-data)]
    (map #(zipmap headers %) rows)))

(defn result-map-all [result-coll] (mapcat result-map result-coll))

(defn query-async [id query next? result]
  (let [posted (query)
        async-token ((json/parse-string (:body posted) true) :token)]
    (loop [response (get-query-result id async-token next?)]
      (if (or (= 200 (:status response)) (= 201 (:status response)))
        (query-table-parse id response result)
        (do
          (println "Waiting for query to process...")
          (recur (get-query-result id async-token next?)))))))

(defn query-table-parse [id response result]
  (let [body (json/parse-string (:body response) true)
        next-page-token (or (:nextPageToken body) (get-in body [:queryResult :nextPageToken]))]
    (if (nil? next-page-token)
      (conj result body)
      (do
        (println "Getting next page of results...")
        (query-async id #(post-query-table id next-page-token true) true (conj result body))))))

(defn query-table
  ([id] (query-table id {:sql (str "SELECT * FROM " id)}))
  ([id query-map] (query-async id #(post-query-table id (query-bundle id query-map) false) false [])))

(defn transform-files
  "Process files for public portal consumption. Should be applied after retrieval of biospecimen data.
  Entities are filtered by the clinical data or have placeholder 'NA' if unannotated."
  [biospecimens data]
  (->>(filter #(= (:type %) "file") data) ; TODO some folders used as symbolic files
      (filter #(or (nil? (:BiospecimenID %)) (cset/subset? (set (json/parse-string (:BiospecimenID %))) biospecimens)))
      (map (fn [x]
             {:Component (or (:Component x) "NA")
              :assayName (if (:Component x) (str/replace (:Component x) #"Level.?\d" "") "") ; derived
              :projectId (:projectId x)
              :filename (x :name)
              :fileFormat (or (:FileFormat x) "NA")
              :level (if (:Component x) (re-find #"Level.?\d" (:Component x)) "") ; derived
              :DataFileID (:id x)
              :dataset_id (:parentId x)
              :biospecimenIds (or (json/parse-string (:BiospecimenID x)) ["NA_Biospecimen"])
              :diagnosisIds (or (json/parse-string (:ParticipantID x)) ["NA_Participant"])
              :demographicsIds (or (json/parse-string (:ParticipantID x)) ["NA_Participant"]) }))))

(defn transform-atlases
  "Start translation to portal AtlasX."
  [data]
  (map (fn [x]
         {:atlas_id (:id x)
          :atlas_name (:name x)
          :team_id (:teamID x)
          :team_name (:teamName x)
          :atlas_description (:description x)
          :publication (json/parse-string (:publication x))
          :status (:status x)
          :governance (:governance x)})
       data))

(defn transform-datasets
  "First-pass processing of datasets, filtering out any not associated with a parent atlas"
  [data]
  (->>(filter #(not (nil? (:atlas %))) data)
      (map (fn [x]
         {:dataset_id (:id x)
          :dataset_name (:name x)
          :in_atlas (:atlas x)
          :publication (:publicationDOI x)
          :contributor (:dataLead x)
          :downloadSource (:downloadSource x)
          :governancePhase (:governancePhase x) }))))

(defn transform-biospecimens [data]
  (map (fn [x]
         {(keyword (:SampleID x))
           {:BiospecimenID (:SampleID x)
            :ParentID (or (:ParticipantID x) "NA_Participant")
            :BiospecimenType (or (:BiospecimenType x) "NA")
            :atlas_id (:inAtlas x) }}) data))

(defn transform-demographics [data]
  (map (fn [x]
         {(keyword (:ParticipantID x))
           {:ParticipantID (:ParticipantID x)
            :Race (or (:Race x) "NA")
            :Ethnicity (or (:Ethnicity x) "NA")
            :atlas_id (:inAtlas x)}}) data))

(defn transform-diagnosis [data]
  (map (fn [x]
         {(keyword (:ParticipantID x))
          {:ParticipantID (:ParticipantID x)
           :atlas_id (:inAtlas x)}}) data))

(defn count-files [files]
  (->>(frequencies (map :atlas_id files))
      (map (fn [x] {:atlas_id (first x) :num_files (second x)}))))

(defn count-datasets [datasets]
  (->>(frequencies (map :in_atlas datasets))
      (map (fn [x] {:atlas_id (first x) :num_datasets (second x)}))))

(defn group-datasets [datasets]
  (->>(group-by :in_atlas datasets)
      (map (fn [x] { :atlas_id (first x) :datasets (map :dataset_id (second x))}))))

(defn count-biospecimens [biospecimens]
  (->>(frequencies (map :inAtlas biospecimens))
      (map (fn [x] {:atlas_id (first x) :num_biospecimens (second x)}))))

(defn count-cases [cases]
  (->>(frequencies (map :inAtlas cases))
      (map (fn [x] {:atlas_id (first x) :num_cases (second x)}))))

(defn join-on-key
  [k table1 table2]
  (->>(concat table1 table2)
      (group-by k)
      (map val)
      (map (fn [[row1 row2]]
             (merge row1 row2)))))

(defn pipe [tb transform-fn]
  (->>(query-table tb)
      (result-map-all)
      (transform-fn)))

(defn merge-src [src records] (map #(merge (select-keys src [:inAtlas :inDataset]) %) records))

; NOTE Processing has to be done in certain order, where clinical data is used to filter files
(when (not (nil? (opts :output)))
  (def clinical-biospecimens-src
    (let [sql (str "SELECT * FROM " clinical-tb " WHERE inPortal is true and Component in ('Biospecimen','Participant+Biospecimen')")]
      (->>(query-table clinical-tb {:sql sql})
          (result-map-all))))

  (def clinical-biospecimens
    (->>(map #(result-map-all (query-table (:id %))) clinical-biospecimens-src)
        (mapcat #(merge-src %1 %2) clinical-biospecimens-src)))

  (def clinical-biospecimens-processed
    (conj (transform-biospecimens clinical-biospecimens)
        {:NA_Biospecimen {:Component "Biospecimen" :BiospecimenID "NA_Biospecimen"
                          :ParentID "NA_Participant" :atlas_id "" :atlas_name ""}}))

  (def all-biospecimens (set (map :SampleID clinical-biospecimens)))

  (def files
    (->>(query-table file-tb)
        (result-map-all)))

  (def files-inter "Intermediate rep to track how many files were filtered out by un-matched Biospecimen IDs"
    (transform-files all-biospecimens files))

  (def datasets (pipe dataset-tb transform-datasets))

  (def files-processed "Filter and inherit atlas_id via dataset"
    (->>(cset/join files-inter (map #(select-keys % [:dataset_id :dataset_name :in_atlas]) datasets))
        (map #(cset/rename-keys % {:in_atlas :atlas_id}))))

  (def clinical-participants-src
    (let [sql (str "SELECT * FROM " clinical-tb " WHERE inPortal is true and Component in ('Participant', 'Participant+Biospecimen')")]
      (->>(query-table clinical-tb {:sql sql})
          (result-map-all))))

  (def clinical-participants
    (->>(map #(result-map-all (query-table (:id %))) clinical-participants-src)
        (mapcat #(merge-src %1 %2) clinical-participants-src)))

  (def file-cases
    (set (mapcat json/parse-string (map :ParticipantID files))))

  (def all-cases (set (map :ParticipantID clinical-participants)))

  (println (str "File cases are a subset of all cases: " (cset/subset? file-cases all-cases)))

  (def placeholder_P
    {:NA_Participant {:Component "Demographics" :ParticipantID "NA_Participant"
                      :Race "NA" :Ethnicity "NA" :atlas_id "" :atlas_name ""}})

  (def clinical-demographics (conj (transform-demographics clinical-participants) placeholder_P))

  (def clinical-diagnosis (conj (transform-diagnosis clinical-participants) placeholder_P))

  (def atlases (pipe atlas-tb transform-atlases))

  (def atlases-processed "Derive summaries, filter out ones with 0 datasets, fill in non-clinical atlases with 0's"
    (->>(join-on-key :atlas_id (group-datasets datasets) atlases)
        (join-on-key :atlas_id (count-datasets datasets))
        (join-on-key :atlas_id (count-biospecimens clinical-biospecimens))
        (join-on-key :atlas_id (count-cases clinical-participants))
        (filter #(:datasets %))
        (map #(if (nil? (:num_cases %)) (merge {:num_biospecimens 0 :num_cases 0} %) (identity %)))))

  (def superatlas
    "Sum of all team-specific atlases, i.e. this is the Pangaea.
    An undercount of all assets as includes only what is visible in the portal and all NAs count as 1."
    {:atlas_id "BRCA"
     :atlas_name "Gray Foundation BRCA Pre-cancer Atlas"
     :num_atlases (count atlases-processed)
     :num_datasets (reduce + (map #(count (:datasets %)) atlases-processed))
     :num_biospecimens (count clinical-biospecimens-processed)
     :num_cases (count clinical-diagnosis)})

; TODO Some sanity checks:
; biospecimens should be >= cases

  (def processed-data
    {:files files-processed
     :superatlas superatlas
     :atlases atlases-processed
     :biospecimenByBiospecimenID (into (hash-map) clinical-biospecimens-processed)
     :diagnosisByParticipantID (into (hash-map) clinical-diagnosis)
     :demographicsByParticipantID (into (hash-map) clinical-demographics) })

  (let [base-output (opts :output)]
    (json/generate-stream processed-data (io/writer base-output) {:pretty true})
    (when (not (opts :no-gz))
      (gzip base-output (str base-output ".gz"))
      (io/delete-file base-output))
    (println "Done with export."))
  )
