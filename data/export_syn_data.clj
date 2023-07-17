(require '[babashka.http-client :as http])
(require '[cheshire.core :as json])
(require '[clojure.java.io :as io])
(require '[clojure.set :as cset])

(def token (System/getenv "SYNAPSE_AUTH_TOKEN"))
(def atlas-tb "syn51755925")
(def dataset-tb "syn27608832")
(def clinical-tb "syn51857871")
(def file-tb "syn28142805")
(def entity-endpoint "https://repo-prod.prod.sagebase.org/repo/v1/entity/")

(declare query-table-parse)

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
        next-page-token (get-in body [:queryResult :nextPageToken])]
    (if (nil? next-page-token)
      (conj result body)
      (do
        (println "Getting next page of results...")
        (query-async id #(post-query-table id next-page-token true) true (conj result body))))))

(defn query-table
  ([id] (query-table id {:sql (str "SELECT * FROM " id)}))
  ([id query-map] (query-async id #(post-query-table id (query-bundle id query-map) false) false [])))

; Transformation to the portal export format with custom selection/mapping/derivation
; Some summary data are "rolled up" from child entity to parent entity, e.g. from files to datasets

(defn transform-files
  "Transform/filter file meta for public portal. For files not yet annotated, values get placeholder 'NA'."
  [data]
  (->>(filter #(= (:type %) "file") data)
      (map (fn [x]
             {:Component (or (:Component x) "NA")
              :projectId (:projectId x)
              :filename (x :name)
              :fileFormat (or (:FileFormat x) "NA")
              :DataFileID (:id x)
              :dataset_id (:parentId x)
              :biospecimenIds [(or (:BiospecimenID x) "NA")]
              :diagnosisIds [(or (:ParticipantID x) "NA")]
              :demographicsIds [(or (:ParticipantID x) "NA")]}))))

(defn count-files [files]
  (->>(frequencies (map :dataset_id files))
      (map (fn [x] {:dataset_id (first x) :num_files (second x)}))))

(defn transform-atlases [data]
  (map (fn [x]
         {:atlas_id (:id x)
          :atlas_name (:name x)
          :team_id (:teamName x)
          :team_name (str "Team " (:teamName x))
          :description (:description x)})
       data))

(defn transform-datasets
  "First-pass processing of datasets, filtering out any not associated with a parent atlas"
  [data]
  (->>(filter #(not (nil? (:atlas %))) data)
      (map (fn [x]
         {:atlas_id (:atlas x)
          :dataset_id (:id x)
          :dataset_name (:name x)
          :publication (:publicationDOI x)
          :contributor (:dataLead x)
          :downloadSource (:downloadSource x)
          :governancePhase (:governancePhase x) }))))

(defn count-datasets [datasets]
  (->>(frequencies (map :atlas_id datasets))
      (map (fn [x] {:atlas_id (first x) :num_datasets (second x)}))))

(defn augment-entities [new-data entities]
  (cset/join (into (hash-set) entities) (into (hash-set) new-data)))

; Clinical data transformations are specific for Participant (Case-level) & Biospecimen data
; This is quite conservative in only exporting basic data for public portal consumption
(defn transform-biospecimens [data]
  (map (fn [x]
    {(keyword (:SampleID x))
          {:Component "Participant"
           :BiospecimenID (:SampleID x)
           :ParentID (:ParticipantID x)
           :BiospecimenType (or (:BiospecimenType x) "NA")}}) data))

(defn transform-demographics
  "Get just demographics-type attributes from a case-level clinical data"
  [data]
  (map (fn [x]
         {(keyword (:ParticipantID x))
          {:Component "Demographics"
           :ParticipantID (:ParticipantID x)
           :Race (or (:Race x) "NA")
           :Ethnicity (or (:Ethnicity x) "NA")}})
       data))

(defn transform-diagnosis
  "Placeholder for diagnosis element for now, but confusing for precancer atlas and needs replacement later"
  [data]
  (map (fn [x]
         {(keyword (:ParticipantID x))
          {:Component "Diagnosis"
           :ParticipantID (:ParticipantID x)
           }})
       data))

(defn pipe [tb transform-fn]
  (->>(query-table tb)
      (result-map-all)
      (transform-fn)))

; Data transform is two-way, some data not known until other data is retrieved
(def files (pipe file-tb transform-files))

(def datasets
  (->>(pipe dataset-tb transform-datasets)
      (augment-entities (count-files files))))

(def atlases
  (->>(pipe atlas-tb transform-atlases)
      (augment-entities (count-datasets datasets))))

(def datasets-processed
  (augment-entities datasets (map #(select-keys % [:atlas_id :atlas_name]) atlases)))

; atlas_id and name passed down to files from datasets
(def files-processed
  (augment-entities files (map #(select-keys % [:dataset_id :atlas_id :atlas_name]) datasets-processed)))

; Clinical has different processing pipe; clinical-db a table where rows are other tables
(def clinical-biospecimens
  (let [sql (str "SELECT * FROM " clinical-tb " WHERE inPortal is true and Component in ('Biospecimen','Participant+Biospecimen')")]
    (->>(query-table clinical-tb {:sql sql})
        (result-map-all)
        (mapcat #(result-map-all (query-table (:id %))))
        (filter #(not (nil? (:ParticipantID %)))))))

(def clinical-biospecimens-processed (transform-biospecimens clinical-biospecimens))

(def clinical-participants
  (let [sql (str "SELECT * FROM " clinical-tb " WHERE inPortal is true and Component in ('Participant', 'Participant+Biospecimen')")]
    (->>(query-table clinical-tb {:sql sql})
        (result-map-all)
        (mapcat #(result-map-all (query-table (:id %)))))))

(def clinical-demographics (transform-demographics clinical-participants))

(def clinical-diagnosis (transform-diagnosis clinical-participants))

(def processed-data
  {:files files-processed
   :atlases atlases
   :atlasDatasets datasets-processed
   :biospecimenByBiospecimenID (into (hash-map) clinical-biospecimens-processed)
   :diagnosisByParticipantID (into (hash-map) clinical-diagnosis)
   :demographicsByParticipantID (into (hash-map) clinical-demographics) })

(do
  (json/generate-stream processed-data (io/writer "processed_syn_data.json") {:pretty true})
  (println (str "Exported processed data to JSON!")))
